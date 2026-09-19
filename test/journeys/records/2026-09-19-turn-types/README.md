# TurnBridge message types: live gate, 2026-09-19

Gate: `node scripts/debug/so-turn-types-check.mts --image sd`, headed, real backend. The main connection
and extraction ran on Artemis 31B through the "Artemis RunPod" and "Story Orchestrator Memory RunPod"
Connection Manager profiles; `/sd` ran on the local ComfyUI (JANKU_v777). No `debugResponse` globals
were set. Group: AdolionGroup, where both members greet. Solo: "Adventure Awaits!", which has alternate
greetings.

| Check | Pre-fix build | Fixed build, run 1 | Fixed build, run 2 |
|---|---|---|---|
| `b-image`: a real `/sd` post, type `extension` | **fail**: boundary 0 → 1 | pass: 0 commits, 0 afterSpeak | pass |
| `a-reply`: a real player turn | pass: +1 (two member replies, one commit) | pass: 1 commit at msg 4 | pass |
| `c-greetings`: a new group chat, 2 × `first_message` before `CHAT_CHANGED` | **fail**: afterSpeak ran with the *previous* chat's story while ST reported the new chat. The commit was dropped only because `CHAT_CHANGED` cleared the pending flag first. | pass: 0 commits, 0 afterSpeak, no story state | pass |
| `c-origin`: the chat that was open keeps its boundary | pass | pass | pass |
| `d-reopen`: a greeting-only solo chat that plays the story, reloaded | **fail**: boundary 0 → 1 on every open | pass: `first_message` re-emitted, 0 commits | pass |
| `d-swipe`: its greeting swiped to an alternate (`MESSAGE_SWIPED(0)`) | pass: no rollback | pass: 0 commits, no rollback | pass |

Files:
- `prefix-baseline-full.json`: the first pre-fix run. It compared boundary numbers only, so the group
  greeting race passed.
- `prefix-baseline-new-group-chat.json`: the pre-fix run after the check started counting real
  `onBoundary` commits and `fireAfterSpeak` calls (new-group-chat stage only).
- `fixed-run1.json` and `fixed-run2.json`: the full gate on the fixed build, two consecutive runs.
