# v2.5 plan 09 — SP10 tool-call turns, spike report

**Verdict: PENDING.** Conditions are the plan's predeclared table (`09-research-spikes.md` §SP10) and are not retuned.
This file was committed with the fixtures and the measurement procedures below, before any spike code and before any run
(rule 1). Rows are filled in as each leg runs; the worth review (rule 8) is written after the live legs, or not at all if a
deterministic condition fails the spike.

## Host facts (ST `7c3994196`, re-verified at step 0)

| Fact | Seen |
|---|---|
| `coreChat` keeps tool-result system messages only when tools are usable | `public/script.js:4494-4496` |
| A tool call recurses with `depth + 1` after saving the invocations (streaming / non-streaming) | `public/script.js:5433-5435`, `:5556-5558` |
| A streamed intermediary reply is finalized with `unlockUI: false` and emits `MESSAGE_RECEIVED` + `CHARACTER_MESSAGE_RENDERED` | `public/script.js:5416`, `:3755`, `:3798-3800` |
| An empty intermediary is deleted with `deleteLastMessage` (`MESSAGE_DELETED`, post-delete length) | `public/script.js:5414-5415`, `:1607-1611` |
| The invocation message is `is_system` with `extra.tool_invocations`, pushed after `TOOL_CALLS_PERFORMED`, rendered by `addOneMessage` (no `MESSAGE_RECEIVED`) | `public/scripts/tool-calling.js:898-920` |
| Deleting a reply also deletes the tool-invocation messages right before it | `public/script.js:1614-1629` (`getMessageDeletionStartId`) |
| `isGenerating()` is `is_send_press || is_group_generating`; the recursion does not unblock in between | `public/script.js:604`, `:5693-5704` |
| `GENERATION_STARTED` carries no depth | `public/script.js:4299` |
| Tools are offered with `tool_choice: 'auto'`; tool calls need `main_api === 'openai'` and `function_calling` | `public/scripts/tool-calling.js:414-417`, `:614-620`, `:694-700` |
| `registerFunctionTool` / `unregisterFunctionTool` / `isToolCallingSupported` / `chatCompletionSettings` are on the context | `public/scripts/st-context.js:183-185`, `:227` |

## Measurement procedures (predeclared)

**Q1 — inflation.** `test/scenarios/v25-09-tool-turn.json`, lane only, a Chat Completion profile (v2.4 plan 06 recipe:
`chat_template_kwargs {enable_thinking: false}`), dev bundle (the probe is `__SO_DEV__`). One dummy tool
(`so_sp10_roll`) is registered; it is made **mandatory** by forcing `tool_choice: "required"` on every request whose
messages carry no `tool` result after the last `user` message (the continuation is left on `auto`, or the chain would run to
ST's `RECURSE_LIMIT`). Ten player turns through `send_generate` in the sandbox group (the director drafts). The dev probe
(`storyOrchestratorToolTurnProbe`) records, per player turn and per drafted member: generations started (the depth count),
tool calls, rendered replies, boundaries committed (the engine's boundary log attributed by `context.lastMessageId`) and the
per-generation entry points: `onGenerationStarted` (warden note / private withholding), lore `select`, `onMemberDrafted`
(private epistemic swap), the generate interceptor (talk decision + lore intercept), plus talk decisions recorded.
A player turn with no tool call is a run that measured nothing: the fixture fails it instead of reporting it.

**Q2 — fold needed.** From Q1's records. A drafted member's reply chain is the unit: the director may legitimately draft two
members, which is two boundaries and two generations for reasons unrelated to tools. Needed = any chain with > 1 boundary,
or any per-generation entry point entered more than once in one chain. Neither in both runs → FAIL (document only).

**Q3 — fold safe, jest half.** `src/runtime/spikes/toolTurnFold.property.test.ts`, seeds `[1, 7, 20260921, 424242]`,
200 generated chats per seed. A chat is 6–10 player turns; each reply chain is either a plain reply or 1–2 tool rounds
(intermediary reply, invocation message, continuation), with per-message deltas on a monotonic int and a latching bool
(`test/fixtures/v25-09-tool-fold.story.json`, where one transition per boundary makes a fold observable). Commits go through
the real `TurnBridge` with the fold on (host mocked: renders, `GENERATION_ENDED`, `isHostGenerating` true for the whole
chain as `:604` says) into a real `StoryEngine`; a boundary's read enqueues the deltas of every message after the previous
boundary with `turnRange` = that span. For **every message id m** (a delete from m to the end, which is what ST does when a
reply is deleted with its tool calls, or the tail is cut), rollback is the runtime's composition (`rollback.ts`:
`boundaryBeforeMessage`, `shouldRollbackFromMessage`, `rollbackTo`, `clampToChat`, `discardPendingFrom`) and replay is a
fresh bridge + engine over messages `< m`, fold on. Equal = same active checkpoint, visited path, visited anchors and
blackboard values. PASS = 0 divergent (chat, m) pairs over all seeds. Control arm: the same generator and cuts with the fold
off must also be 0, or the property is not measuring the fold.

**Q3 — live half.** J6 ×2 on one lane with `spikes.toolTurnFold` on (set install-wide, page reloaded), only if the jest
half passes.

## Conditions

| # | Condition | Pass | Measured | Result |
|---|---|---|---|---|
| Q1 | Inflation measured | boundaries per player turn and per-depth work counts recorded, ×2 | pending | pending |
| Q2 | Fold needed | > 1 boundary per chain or any per-generation work twice per chain | pending (from Q1) | pending |
| Q3 | Fold is safe | rollback ≡ replay (jest, 4 seeds) and J6 green ×2 | pending | pending |
