# v2.5 plan 09 — SP5 story-owned scenario spike report

**Verdict: pending.** Nothing is measured yet.

The conditions are plan 09's predeclared table (`09-research-spikes.md` §SP5, committed in `9eaee9e4` before any code) and are
**never retuned** (rule 1). The live fixture and its expectation helper are committed before the spike code:
`test/scenarios/live-v25-09-sp5-scenario.json` (stories `live-v25-09-sp5.story.json`, `live-v25-09-sp5-none.story.json`; helper
`test/fixtures/interop/v25-09-sp5.js`, which recomputes the expected scenario from the AUTHORED story and the engine's
`visitedPath`, not from `src/runtime`).

## Conditions

| # | Condition | Measured by | Pass | Deterministic (jest) | Live ×2 |
|---|---|---|---|---|---|
| C1 | Per-chat correctness | chats A (cp3), B (cp1), C (no story); switch A→B→C→A ×3, capture each request | scenario == path replay's, 100 %; none in C | pending | pending |
| C2 | User override kept | a user-set override, then a checkpoint write, then leave | compare-and-set: `externally-changed` recorded, the user's text never clobbered | pending | pending |
| C3 | Rollback | rollback past a scenario-writing checkpoint | the previous scenario restored (a `RESTORABLE` row) | pending | pending |
| C4 | Group | 3-member group | one scenario block in the request, not three | pending | pending |
| C5 | Competing cards | cards whose scenarios compete with a story that sets none | an author-view diagnostic names them; no player copy (rule 7) | pending | pending |

## Procedure (stated before measuring)

- The spike is `effects.scenario` on a checkpoint: a string sets the chat's scenario override, `null` or `""` clears it, a checkpoint
  without the key keeps what the path before it set (path replay, like `world_info`). It writes ST's per-chat override
  `chat_metadata.scenario`, which ST prefers over the card's (solo `script.js:3445`) and which replaces every member's collected card
  scenario in a group (`group-chats.js:561-567`). The user's own control for it writes the same key and saves
  (`script.js:9051-9054`). `getContext().chatMetadata` is the live object (`st-context.js:135`).
- Every write goes through the effect ledger as its own target, restorable, and chat-scoped like the Author's Note: leaving a chat
  never restores into the chat that is open next.
- The story writes only over an empty override or over its own last write. Anything else is the user's, and the write is refused
  and recorded `externally-changed` with what it found (C2).
- C5's author surface is the session journal (`getSessionJournal()`, the author/eval artifact the drawer never renders for a player)
  plus `assert-player-clean`. A drawer panel would be the `.b` build's; its player copy waits on the human sessions (rule 7).
- Deterministic legs run in jest once; the live legs run ×2 consecutive on one lane (rule 1, review #73). The live legs need no model:
  the request is ST's own dry-run assembly, and C3's two reads use `debugResponse` because the host effect is what is measured.
- C4's non-vacuity: the fixture plants a card scenario on each member in memory, switches the group to APPEND for the capture, and
  requires a control capture (override emptied in memory) that carries every enabled member's card scenario once.
