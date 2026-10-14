# Plan 56 — Social permissions

**Status: candidate, owner decision pending.** Written 2026-10-14 from the Astra review's brainstorm (owner approved
writing it the same day). Not built, not queued. Implementation tier **D**; acceptance **D** + **LT/RP** (members
honour a permission in play). Overview: `00-overview.md` §Rules (this folder). Shared boundary contract: v2.8 52
§Review 2026-10-14 (Astra), SC1–SC5.

## What it is

- Concrete social consequences instead of higher scores: **introductions** ("the ferryman introduced you to the
  harbourmaster"), **invitations** ("invited to the feast"), **privileges** ("may use the archive", "may speak for the
  guild").
- A permission is granted by an evidenced story event, held by the player, and known to specific characters. It opens
  doors the author wrote: transition and quest gates, codex entries (an introduction makes a person known), and one
  private line for each member who knows it ("The player is welcome in the archive; let them in").
- It is revoked only by an evidenced event (an insult, a theft), never by time or absence. It is never a currency and
  never counts down.
- The player sees what they have been granted, by whom, in words, on the grantor's person or faction page.

## History and evidence

- `review-astra-2026-10-14.md` §Plans 48-53, additional mechanic 2: "Social permissions. Earned introductions,
  invitations and privileges—concrete consequences more interesting than higher scores." Build order: "build NPC
  commitments and social permissions first."
- Same review, 53 brainstorm: "Institutional standing affecting access, greetings and competing invitations. Let a
  friendly individual bend an unfriendly institution's rules without erasing either relationship."
- v2.8 53 §Review: access and invitations routed here; a permission may gate on a faction band.

## Current state in code

Verified on master `3a716f2b`.

- **Partly possible today.** An author can declare a code bool and set it from a quest reward (`checkRewardSet`
  accepts any declared code quality, `src/engine/validate/quests.ts:228-236`; applied in `applyQuestRewards`,
  `src/engine/quests.ts:74-84`), then gate transitions on it (`GateLeaf {q, op, v}`, `src/engine/schema.ts:105-123`).
- **Missing:** a named permission with a grantor and player wording; grants from events other than quest completion;
  revocation semantics; which members know it; a player projection; and the introduction link to the codex.
- **Private block** per member: `privateLifeLines` (`src/engine/life/lines.ts:45-58`).
- **Codex** (v2.8 52, not built) owns entity discovery; an introduction is a discovery with a named source.
- No `permission`/`invite` concept in `src/engine` (`grep -rniE "permission|invit" src/engine` → none relevant).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored permissions** | `permissions[]`: label, grantor, `granted_when`, `revoked_when?`, `known_to`, `introduces?`; latched; member lines; player list on pages | S–M | authors must write grants; sparse stories feel static |
| **B. Today's tools** | code bool + quest reward + a `clues` widget row | 0 | no grantor, no member knowledge, grants only on quest completion |
| **C. A + read-detected invitations** | the shared read proposes an invitation a member makes in a line; author-approved or member-line evidenced | M + read lines | invented invitations; second evidence guard needed (shared with v2.8 55 B) |
| **D. Nothing** | | 0 | standing and labels stay abstract |

## Recommendation

**A.**

- **Format** (lazy game layer): `permissions: [{id, label, kind: "introduction" | "invitation" | "privilege", grantor:
  <roster id | faction id>, granted_when, revoked_when?, known_to?: [roster ids] | "grantor-faction", introduces?:
  <codex entry id>}]`. `label` ≤ 60 characters of player text ("Welcome in the archive").
- **State.** Latch `perm_<id>` (code enum `granted | revoked`) in the latch pass (SC2 step 5, re-run at step 7);
  rollback detector registered (SC1). A grant that was revoked can be granted again only by a new authored grant id
  (no flapping).
- **Revocation needs an event**, by the same rule as v2.8 53 negative moves and v2.8 55 `broken_when`: no gate of time
  keys only, `== false`, a start value or a top-level `not`.
- **Who knows.** `known_to` defaults to the grantor (and, for a faction grantor, its members). Each knowing member, when
  drafted, gets one private line: "<grantor> has granted the player: <label>. Honour it unless the story gives you a
  reason not to." Others get nothing; a member who later learns it does so through an authored gate (`known_to` may
  name a gate per member) or v2.8 44 rumors.
- **Introductions.** `introduces` makes that codex entry known in the same latch pass, with provenance "Introduced by
  <grantor>" (v2.8 52 `from`).
- **Gates.** `perm_<id>` is an ordinary gate key: transitions, quests, codex facts, widgets. A faction band or a 51
  label may be part of `granted_when` (an individual can grant what the institution would not).
- **Player view.** On the grantor's person or faction page: "Granted: <label>". A revoked row shows "No longer:
  <label>" only once the revoking event is disclosed (an authored `revoked_disclosed_when`; default `revoked_when`,
  for the common case where the player saw the revoking event); until then it stays "Granted", because a row vanishing silently would reveal the
  hidden event (decision 4). Hidden until granted; no "2 invitations left".
- Studio editor under State and rules, wizard tool `set_permission`, guide topic `permissions`, registry feature
  `social-permissions` (on by default, rule 9).

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| G1 | Rollback ≡ replay of `perm_*` over 4 seeds (swipe, edit, delete, reopen) plus a code-only boundary (SC1) | 4/4 + 1 | D |
| G2 | Knowledge scope: a permission line reaches only members in `known_to`; 0 strays over drafted members (payload goldens + property) | 0 strays | D |
| G3 | Revocation by event only: time/absence revocations refused by the validator; property: no `revoked` without its event key changing | 100 % | D |
| G4 | Spoiler property: ≥ 500 seeds; no ungranted label, grantor of an unknown entity (SC3) or count on player surfaces; page byte-identical with and without ungranted permissions | 0 leaks, identical | D |
| G5 | Introduction: `introduces` makes the entry known in the same boundary as the grant (SC2 step 5) | 100 % | D |
| G6 | Feature-only fixture: a story with only permissions renders them (SC4) | holds | D |
| G7 | Honoured in play: 10 paired lab scenes (permission granted vs not, same request by the player), second-model rater picks the scene where the member lets the player in, blind | ≥ 8/10 | LT or RP |

## Gates by tier

- **D:** `npm run gates` (validator, latch pass, member lines, projection, G1–G6; Storybook for the page rows and the
  editor); payload goldens (G2); guide and tools coverage; a no-model lane scenario: grant by a seeded event, member
  line present, swipe removes it, reopen identical; `so-ui.mts assert-player-clean`.
- **LT/RP:** G7 in the final v2.8 suite (rule 8), lab story only.

## Privacy and spoiler notes

- A permission names the grantor; the grantor must be known before its row shows (SC3).
- Member lines are per member (G2); never a shared tier, never World Info.
- A revoked row never explains an undisclosed cause (decision 4).
- No Adolion content here.

## Dependencies and links

- **v2.8 52** codex (pages, `knownEntities`, introductions). **v2.8 53** factions (grantor kind, band gates).
- **v2.8 51** labels (a label may gate a grant). **v2.8 44** rumors (knowledge of a grant may travel).
- **v2.8 55** commitments (a member may commit to obtain a permission; a kept commitment can be its gate).
- **v2.7 36** quests (reward-driven grants keep working as code bools).

## Decisions for the owner

1. **Option A?** **Recommended: yes.**
2. **Revocation only on an affirmative event?** **Recommended: yes.**
3. **Member knowledge per `known_to` (grantor and, for a faction, its members), not everyone?** **Recommended: yes.**
4. **Revoked rows:** show "No longer: …" only once the revoking event is disclosed, otherwise keep showing "Granted"
   until it is? **Recommended: yes.** Removing the row silently would itself reveal the hidden event.
5. **One grant id per grant (re-granting needs a new id)?** **Recommended: yes**, so a grant cannot flap.

## Unresolved questions

- Permissions between members (a member granted access by another): out of scope; one holder, the player.
- Should a privilege appear in the next-turn preview for the author? Proposed: yes, author view only.
- Cap values (60 characters, permissions per story) are placeholders until the editor is drawn.
