# Plan 33 — Stories run in group chats only

**Status: DRAFT 2026-10-03 (user decision while reviewing plans 04, 29 and 30). Not approved as built; the direction is
decided.** Overview: `00-overview.md`.

The user's words:
- Plan 04: "Do we support solo chats on this plugin? I thought we only supported group chats. Should we support solo? I
  think it goes against many of this plugin's mechanics."
- Plan 29: "I think this plugin makes no sense for solo players; let's only consider group. Plugin should be disabled for
  solo chats."

## What solo support exists today

Solo chats are half-supported, which is the worst of both:
- **A story can be selected and played in a solo character chat.** The runtime loads, extraction reads, effects apply.
- **Some systems have solo-specific code:**
  - the solo epistemic block (`runtime/memoryInjector.ts:120-122,176-178,267-272`, `renderSoloEpistemicBlock`);
  - the solo member hook (`runtime/managerWiring.ts:128`);
  - D10 archive recall running in solo chats (plan 29: `runtime/loudGenerationGate.ts:32-42`).
- **Many core mechanics assume a group and simply do nothing solo:**
  - speaker direction and chains (`talk/`), cast changes, per-member private knowledge, NPC replies as other members;
  - the roster's member requirements;
  - the campaign finding "a solo or partial group gets no checkpoint effects at all" (campaign F8/C3, fixed for the
    effects part in `e04783c2`).
- **Plans written today keep paying a solo tax:** plan 04 (badges on solo characters), plan 29 (solo-only spike scope),
  plan 30 (persona switch reloads differ solo vs group), plan 32 (avatars).

## Decision and design

**The story runtime runs only in group chats.**

1. **Solo chat with a story selected or bound:** the runtime stays inactive (no reads, no injections, no effects, no
   HUD). The drawer and settings show one card:
   - "Stories play in group chats. [Make a group for this story]".
   - That button runs the existing provisioning path: a group with the story's cast (or this character plus the story's
     narrator), confirmed by the player, create-only.
2. **Story selection is refused with no group open,** the same way the "no chat, no story" invariant refuses with no
   chat. The message names the fix.
3. **A one-character story is a group of one plus a narrator.** The wizard's setup step always creates a group, which it
   already does for multi-cast stories.
4. **Solo-only code is removed, not kept dormant** (no-legacy rule):
   - the solo epistemic block and the solo member hook;
   - solo branches in injection;
   - the solo path in the loud-generation gate;
   - their tests and fixtures, which are rewritten as group tests or deleted with a reason.
5. **Existing solo chats that played a story** (v2.6 sessions, the user's install): their metadata is left untouched.
   Opening one shows the "make a group" card. Nothing is migrated automatically. The v2.6 records stay history.
6. **Invariant (architecture.md):** "No group, no story" joins "No chat, no story". Checks: `noGroupChat` in the snapshot,
   a refusal status, tests mirroring `runtime/noChatOpen.review.test.ts`.

## Effects on other plans

| Plan | Change |
|---|---|
| 04 story presence | badges on groups only (decision 1 answered) |
| 29 verbatim recall | the "solo first" spike scope becomes "groups with witness filtering, or not at all"; the D10 solo path goes |
| 30 persona | one flow (the group reload path); persona chosen at story start, then locked for the story (user: no persona switching inside a story) |
| 31 health center | a `story-needs-group` check (blocks) with the "make a group" action |
| 32 living cards | no solo avatar branch |
| 01 docs | the guide says it up front: stories are group chats |
| harness | scenarios and journeys that open solo chats move to groups; `so-session` cards checked |

## Gates (tier 1, no LLM)

- Pure: the no-group refusal across select, restart, update and effects (like the no-chat tests); the snapshot flag; the
  check; removed code has no remaining callers (typecheck).
- UI: Storybook for the "make a group" card; player-clean sweep.
- Live: a solo chat with a bound story shows the card and nothing else runs (no extraction calls, no injections in
  `GENERATE_AFTER_DATA`); the button creates the group, which then plays.
- `npm run gates`.

## Decisions for the user

1. Runtime inactive in solo chats, with a "make a group" card? **Recommended: yes** (your decision).
2. Remove solo-only code rather than keep it dormant? **Recommended: yes** (no-legacy rule).
3. "Make a group" uses the existing create-only provisioning, confirmed by the player? **Recommended: yes.**
4. Old solo story chats: leave as is, show the card, no auto-migration? **Recommended: yes.**
5. Build position: tier 1, before plans 03, 04 and 30, because they each have solo branches to drop.
   **Recommended: yes.**

## Links

04, 29, 30, 31, 32; `.claude/rules/architecture.md` "No chat, no story".
