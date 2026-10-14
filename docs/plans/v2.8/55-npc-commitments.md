# Plan 55 — NPC commitments to the player

**Status: candidate, owner decision pending.** Written 2026-10-14 from the Astra review's brainstorm (owner approved
writing it the same day). Not built, not queued. Implementation tier **D**; acceptance **D** + **LT/RP** (does the
holder honour or raise it, on the main reply model) + **CL** (option B's read lines only). Overview:
`00-overview.md` §Rules (this folder). Shared boundary contract: v2.8 52 §Review 2026-10-14 (Astra), SC1–SC5.

## What it is

- The reciprocal of v2.8 47. A character can commit to the player ("I will get you past the gate", "I owe you for the
  river"), and the story remembers it: the holder knows it owes the player, can raise it, keep it or (on an evidenced
  event) break it.
- A commitment is a typed record on the **holder** (a roster member): to whom (the player), what, when it was made,
  an optional due point, and a state `made | kept | broken`, with `overdue` derived.
- It is resolved through machinery that exists: gates, latches in the latch pass, the holder's private life block,
  earned effects. No automatic player debt: the player owes nothing because a character offered something.
- Characters with recognisable intentions toward the player, not a task list: the player sees a commitment only where
  it was made in their hearing, and the holder is the one who brings it up.

## History and evidence

- `review-astra-2026-10-14.md` §Plans 48-53, "Up to five additional mechanics" 1: "NPC commitments to the player. The
  reciprocal half omitted from plan 47: authored or accepted commitments, resolved through existing agenda/state
  machinery". Build order: "build NPC commitments and social permissions first".
- Same review §Plans 42-47 brainstorm 1: "NPC favors and assurances … no automatic player debt."
- v2.8 47 §Unresolved: "Do NPC promises to the player matter (the mirror case)? Out of scope for v1."
- `src/memory/contract.ts:31`: `[intends]` is a character's own goal, "never the player's"; it is not a commitment to
  the player and carries no state.

## Current state in code

Verified on master `3a716f2b`.

- **Agendas** are NPC goals with steps, pace and effects (`Agenda`, `AgendaStep` with `when`, `effect`, `public`,
  `src/engine/lifeSchema.ts:31-50`); landed steps are detected by `landedSteps` (`src/engine/life/lines.ts:70-77`) and
  their `world_info` replays through `agendaWorldInfo` (`:60`) and `earnedWorldInfo`
  (`src/runtime/worldInfoGates.ts:50-51`). An agenda is about the member's own goal, not an obligation to the player.
- **Quests** carry a `giver` and `done_when`/`failed_when` (`src/engine/gameSchema.ts:57-72`): an author can model a
  commitment as a side quest today, but it is the player's task, shown to the player as one.
- **Private block**: `privateLifeLines` (`src/engine/life/lines.ts:45-58`) composes relationship, mood and meanwhile
  lines per drafted member, filtered through `withoutSecretLines` in `MemoryInjector.lifeLines`.
- **Earned effects** accept origins `quest | agenda` only (`src/runtime/effectsApplier.ts:83-88`).
- **Player-line evidence** exists (`commit_evidence`, `src/engine/schema.ts:90`; guard `src/extraction/commitGuard.ts:225-232`
  reads `isUser` lines only). No member-line evidence guard exists.
- Nothing named "commitment" exists in `src/engine` or `src/memory`.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored commitments** | `life.members[].commitments[]` with `made_when`, `kept_when`, `broken_when?`, `due?`; latched in the latch pass; holder line; player sees it on the holder's person page once made in their hearing | S–M | author work; only foreseen commitments |
| **B. A + accepted from play** | the shared read emits `[pledged] Holder | what | by <when>` for a member's own line; accepted only when a **member** line in the window carries it (a member-line twin of the commit guard) | M + read lines | false pledges from quotes, sarcasm, hypotheticals; shares 47's line budget |
| **C. Quests with a giver** | status quo | 0 | the commitment reads as the player's task |
| **D. Nothing** | | 0 | one-sided promises (47 only) |

## Recommendation

**A now; B after v2.8 47's read lands**, sharing its line family and dedup.

- **Format** (lazy game layer, `engine/validate/life.ts` style): `life.members[].commitments: [{id, to: "player",
  what, made_when, kept_when, broken_when?, due?: {story_day | boundaries}, effect?: {world_info?, npc_replies?}}]`.
  `what` ≤ 160 characters, plain text. At most 6 per member.
- **State.** Latch `life_commit_<member>_<id>` (code enum `made | kept | broken`, latching per value) written in the
  latch pass (SC2 step 5, re-run at step 7). `overdue` is derived (due passed, or no due and ≥ 12 committed boundaries
  open), never stored. Rollback detector registered (SC1).
- **Broken needs an event.** `broken_when` may not be satisfiable by time or absence alone (the 53 rule: no gate made
  only of time keys, `== false`, start values or a top-level `not`). Overdue is never broken.
- **Holder line** (private block, holder only): made and open: "You told the player you would <what>. It is not done
  yet; it is yours to keep, raise or explain." Overdue adds "It is overdue." Kept, once: "You kept your word to the
  player: <what>." Never an instruction about the player.
- **Player view.** On the holder's person page (v2.8 52), "Promised you: <what>" with state words (open, kept, broken)
  — only when the holder is known (SC3) **and** the commitment was made in the player's hearing (the `made_when` latch
  boundary had the player present; with v2.8 42, its witness record; until then an author flag `heard: true`, default
  true). No overdue marker, no countdown.
- **Kept effect.** Optional `effect` applies through the earned path; `EarnedEffects.kind` gains `"commitment"` and
  `earnedWorldInfo` replays it from the latch.
- **Director.** Open commitments of present members join the director's hook list as world-side hooks ("Mara has
  promised to …") — a member's own act, so no agency conflict.
- Studio editor under Characters, wizard tool field in the character-life tool, guide topic `commitments`, registry
  feature `npc-commitments` (on by default, rule 9).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| M1 | Rollback ≡ replay of commitment latches over 4 seeds (swipe, edit, delete, reopen) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| M2 | Holder only: the commitment line appears in the holder's drafted request only; 0 in other members, the resting block, shared tiers, canon, WI mirror (payload goldens) | 0 hits | D |
| M3 | Never broken by time: a `broken_when` of time keys, `== false`, a start value or a top-level `not` is refused; property: no commitment reaches `broken` without its event key changing | 100 % | D |
| M4 | Player view discloses only what was heard: ≥ 500 seeds; no commitment text for an unknown holder or one made out of hearing | 0 leaks | D |
| M5 | No player debt: no player-facing text frames an obligation of the player; no player reminder (string property over player surfaces) | 0 hits | D |
| M6 | Feature-only fixture: a story with only commitments renders them (SC4) | holds | D |
| M7 | Holder raises an overdue commitment: scripted lab session, overdue at turn 0, holder mentions it within 6 of its drafted turns in ≥ 6/10 runs (baseline without the line recorded beside it) | ≥ 6/10 | LT or RP |
| M8 | B only: labelled member-line set (≥ 40 pledges, ≥ 40 non-pledges incl. quotes, sarcasm, hypotheticals, a pledge attributed to another member): precision ≥ 0.95, recall ≥ 0.70 | as stated | CL |

Synthetic English lab stories only; the owner spot-checks synthetic rows (rule 11).

## Gates by tier

- **D:** `npm run gates` (validator incl. M3, latch pass, holder line, projection, M1–M6; Storybook for the person-page
  row and the Studio editor); payload goldens (M2); guide and tools coverage; a no-model lane scenario: a commitment is
  made, kept, swiped back to made, reopened identical; `so-ui.mts assert-player-clean`.
- **LT/RP:** M7 in the final v2.8 suite (rule 8), lab story only.
- **CL:** M8 with option B.

## Privacy and spoiler notes

- Holder-only model text (M2). A commitment made in private to the player is in the transcript the player sees;
  one made out of the player's hearing never reaches a player surface (M4).
- An author can hide a commitment entirely (`heard: false`) for a twist; it then lives in the holder's block only.
- No Adolion content here.

## Dependencies and links

- **v2.8 47** promises (the player's side): B shares its line family and acceptance shape; a member-line guard is the
  twin of 47's player-line guard.
- **v2.8 52** codex: the person page, `knownEntities`. **v2.8 42**: "in the player's hearing".
- **v2.8 50** calendar: `due` on story time. **v2.8 59** reconciliation: a broken commitment is a natural rupture.
- **v2.7 37** agendas: a commitment may share an agenda's gates; it is not an agenda step.

## Decisions for the owner

1. **Option A now, B after 47's read?** **Recommended: yes.**
2. **Player sees a commitment only when made in their hearing, with no overdue marker?** **Recommended: yes.**
3. **Broken requires an affirmative event, never time?** **Recommended: yes.**
4. **Open commitments as director hooks?** **Recommended: yes**, present members only.
5. **A kept commitment may fire an effect** (`world_info`, `npc_replies`)? **Recommended: yes**, through the earned path.

## Unresolved questions

- Commitments to another member (NPC-to-NPC): out of scope; agendas cover them.
- Should a kept commitment move a relationship axis? Proposed: no in v1; an author gates a 51 label on the latch.
- Cap values (6 per member, 160 characters, 12 boundaries) are placeholders until the editor is drawn.
