# v3.0 19: talk pacing (instruction fix, opening hook, yield on question)

Branch `v3.0-talk-pacing` (worktree `C:\dev\so-talk`), not merged.

Inputs (all in the main checkout's working tree, untracked when this was written):

- `docs/plans/v3.0/research/talk-pacing-review-2026-10-26.md` (the spec; P1/P2/P4 here).
- `docs/plans/v3.0/research/talk-astra-2026-10-26.md` (Astra, independent).
- `docs/plans/v3.0/research/talk-opus-2026-10-26.md` (Opus, independent).
- `C:\dev\so-lanes\reviews\talk-2026-10-26\astra-report.md` does not exist: that first Astra run stopped on a usage limit (`astra-log.txt`) and was rerun as the research file above.

Owner trigger: the narrator's opening is good, but nobody in the party speaks next, so the player is not pulled in.

## Decisions (owner, as recommended)

1. **`instruction` on `kind: "llm"` replies is honoured** (review B1, `effectSteps.ts:66-75`), on every trigger (`onEnter`, `afterSpeak`, `sceneBreak`, earned effects). It is a one-shot private direction for that member's next reply, cleared when the `/trigger` returns (done, refused, stopped, chat moved or run lapsed).
2. **Yield on question**: a chained voice that asks the player something ends the chain and records a `player` hand-back. On by default for every story; opt-out `talk_control.chain.yield_on_question: false`. Applies to director and scripted chains and to `afterSpeak` NPC replies.
3. **Opening hook**: an LLM-written party-member line right after the story's opener, before the player's first send, plus the same shape at any checkpoint entry.
4. **The global agency wording is unchanged** (`NO_CLOSING_QUESTION_CLAUSE`, `agency.ts:32`; pinned by a test). A one-shot direction carries its own scoped exception for its one reply (below). The general change (review P3, Opus P12) needs a blind A/B and stays in the next stage.
5. Owner-facing defaults (lead, recorded here):
   - Swiping a cued line re-arms its cue: the regenerated line keeps its direction.
   - Deleting the opening hook does not repost it (a deletion is a choice).
   - The opening lives on the start checkpoint; no story-level shorthand in this branch.
   - No wall-clock idle nudge.
   - Narrator length cap and spotlight defaults go to the next stage (pacing profiles).

## Schema: why `new_chat_only` on llm, not `talk_control.opening`

- One representation. An opening hook is an ordinary `npc_replies` entry: `{ trigger: "onEnter", kind: "llm", new_chat_only: true }`. Probability, `enabled`, `maxTriggers`, `after_member`, rollback counters, the Studio editor, the wizard parser, storyDiff and the guide all apply unchanged.
- A `talk_control.opening` shorthand would be a second spelling with its own editor, diff, guide topic and validation, and would still have to compile to this.
- The same entry without `new_chat_only` is a chapter or beat-entry hook, so the campaign uses one shape everywhere.

New and changed keys:

- `effects.npc_replies[].new_chat_only` (bool): now allowed on `kind: "llm"` too; still `onEnter` only. Scripted = the story's opener; llm = the opening hook.
- `effects.npc_replies[].ask_player` (bool, llm only, load error on scripted): the member turns to the player and asks one thing in their own voice, then stops.
- `effects.npc_replies[].instruction`: now delivered (llm).
- `effects.npc_replies[].after_member` on `onEnter`: the line fires only when the chat's last line is that member's (roster id, card name or alias).
- `checkpoints[].talk_control.chain.yield_on_question` (bool, default true).

Example, opening hook (start checkpoint):

```json
"npc_replies": [
  { "trigger": "onEnter", "member": "Ruins Narrator", "kind": "scripted", "new_chat_only": true, "text": "You came to Lowmarsh because the water is low at last…" },
  { "trigger": "onEnter", "member": "Mara", "kind": "llm", "new_chat_only": true, "ask_player": true, "after_member": "Ruins Narrator",
    "instruction": "Mara has been watching the road; she wants to know if the newcomer saw the riders." }
]
```

Example, chapter-opening hook (any checkpoint):

```json
"npc_replies": [
  { "trigger": "onEnter", "member": "Ruins Narrator", "kind": "scripted", "text": "The flooded hall opens below the stairs." },
  { "trigger": "onEnter", "member": "Mara", "kind": "llm", "ask_player": true, "after_member": "Ruins Narrator",
    "instruction": "Mara does not like the water; she asks the newcomer whether they can swim." }
]
```

## What was built

- **P1 one-shot direction** (`runtime/npcSpeak.ts` `speakGenerated`, `coordinators/pacingCoordinator.ts` `armDirection`, `pacing/guidance.ts`).
  - Armed before the `/trigger`, released in `finally`. Rendered only in the named member's draft of the guidance block: `Direction for X only, this reply: <text> <ONE_SHOT_SCOPE>`.
  - `ask_player` adds `ASK_PLAYER_DIRECTION` (or `ASK_PLAYER_TAIL` after an instruction).
  - Scoped agency exception: `ONE_SHOT_SCOPE` says the direction wins over the general pacing notes for this one reply, but never lets the member narrate the player or ask what the player does. The guidance block is withheld for quiet/impersonate runs as before.
  - A member outside the cast: journal line "instruction was not delivered", the reply still runs.
  - Cued lines: a reply written under a direction is recorded in `extras.cuedLines` (`messageId`, member, text; cap 20). A swipe of that message re-arms the direction for the regenerated reply (`managerDelegates.cueSwipe`, called from the talk interceptor; scope `draft`, cleared when the drafted generation ends). Rollback rewinds the list (`rewindCuedLines`: delete drops and shifts, swipe/edit keep the swiped line).
- **P2 opening sequence** (`runtime/openingSequence.ts`, `effectsApplier.ts`).
  - Checks the chat for emptiness once, then posts every scripted `new_chat_only` opener in order (Opus 1: only the first used to post).
  - Waits for identity: while the identity step is pending, the start beat's other entering lines are held and fire after the opener (review §1 ordering bug; Opus 3).
  - Order: openers → staging → the start beat's other entering lines → the hook (so the hook's question is the last line before the player's turn).
  - The story's own opener never defers its own beat (Opus 2): no `holdOpener` against it, for entering lines or the hook.
  - The hook waits for cast writes to settle, posts only while its member is switched on in the group (otherwise skipped with a journal line), never after a player line, once per chat (counter `checkpoint:onEnter:member:index`, rewound by rollback).
  - A `new_chat_only` line posts only through the opening, never through a plain entering pass or an earned effect.
- **P4 yield on question** (`talk/asksPlayer.ts`, `talkControl.ts` `advanceChain`, `effectsApplierHost.ts`).
  - Detector, deterministic and conservative: the last quoted line (or the last sentence when nothing is quoted) ends on `?`, names the player or says "you", names no other cast member, the narration after it names no other cast member, and that tail is short (≤ 200 chars) with no further question.
  - Chain: checked after every voice, before max and before the judge; records `kind: "player"`, source `rules`, so "your move" shows.
  - `afterSpeak` NPC replies wait while the last reply asks the player (Astra 4).
- **Fixes found on the way**
  - NPC reply counter keys used the index within the filtered list, so a start-beat opener and the same member's first entering line shared one key and the second never fired. Keys now use the authored index.
  - Held openers follow the messages they were measured against (Astra 7): `rewindDeferredOpener` shifts on earlier deletes, drops when the transition that held it is rolled back, and marks a recheck when the invitation itself is edited, swiped or deleted (released and re-held if still needed at the next reply).
  - The judge counts the hand-back as an option (Astra 5): one remaining member plus PLAYER is a real choice (`directorOptionCount`).
- **P11 chain routing by direct address** (Opus 4): a voice that addresses exactly one other member by name ("Finn, which way?") drafts that member next (`directlyAddressed`), source `mention`, no judge call.
- **Authoring**: validation (`validate/checkpoints.ts`), diagnostics `npc-reply-directs-player` (warning) and `opening-narrator-only` (info) in `studio/hookDiagnostics.ts`, Studio fields (new chat only / opening hook, asks the player, only right after, chain yield checkbox), wizard parser (`copilot/parseFields.ts`), guide topics `opening-scene`, `npc-replies`, `talk-control` and good-practice rule 22, compact twin `guideTopics.ts`, `npm run docs:guide`. No settings changed, so no `docs:settings`.
- **Metrics** (Opus 5): `scripts/debug/so-talk-metrics.mts` over ST chat files: opening hook, turns to first party address, yield after a question, voices per send, party share, lead words p50/p90.

## Limits kept (documented in the guide)

- `afterSpeak` never follows a story-posted line, and can lose a race with a chain's next voice (it then waits for the next turn). No shared speech budget yet (next stage).
- A held entering set and the cued-line re-arm are in memory for the current apply; a page reload between the opener and its held lines loses the held lines (the opener's own counters persist, so nothing posts twice).
- The yield detector misses implicit invitations without a question mark; false negatives keep today's behaviour.

## Next stage (not this branch)

- One shared speech budget across chains and NPC effects; route NPC `llm` replies through the guarded `startVoice`.
- Stable authored reply ids and `once_per: story | entry | player_turn` scopes; cooldowns in player turns, not message indexes.
- Per-checkpoint pacing profiles (narrator message cap, soft prose target, spotlight default).
- Address-the-player beats that ride an already-budgeted reply (0 extra calls).
- Spotlight substitution (replace an optional voice, never add one).
- Reaction beats (budgeted, yield after).
- Zero-cost idle nudge (UI offer only; generation on the player's request).
- Narrowing the global closing-question clause by speaker (review P3, Opus P12): blind A/B first.
- Judge `turn: player` signal (needs a calibration row).
- Record every chain end reason (question, cap, script end, transition, cancel).

## Evaluation (proposed floors, informational, freeze before the run)

From Astra (proposed):

- Opening speaker order and exactly-once scheduling: 100% of deterministic cases.
- First companion address on opening: by assistant message 2, before player send 1, in ≥ 95% of uninterrupted generated openings.
- Opening question quality: ≥ 90% clearly directed to the player, context-specific and answerable.
- Yield after a designated player question: ≥ 95% stop immediately; 100% for explicit scripted yield.
- False yield: ≤ 5% of cases still needing a necessary world response.
- Agency: 0 observed invented player decisions, speech or settled feelings (report sample size).
- Shared generation budget: 100% compliance including NPC effects (next stage).
- Blind quality: median ≥ 4/5 for invitation and naturalness; candidate preference ≥ 60%.
- Cost: ordinary turns average ≤ 1.5 loud generations. Latency: ≤ 10% regression in p95 time to player floor.
- Mutation correctness: 100% deterministic rollback/replay checks; zero stale pending beat landings live.

From Opus (proposed, measured by `so-talk-metrics.mts`):

- Opening hook rate ≥ 0.95 where a hook is authored; turns to first address ≤ 2 in ≥ 0.9 of openings.
- Question-yield integrity ≥ 0.97; answered-for-player rate ≤ 0.02 (rater label).
- Party share ≥ 0.3; voices per send mean in [1.3, 2.2].

## Live gate (owed, NOT green)

The GPU and lanes were busy with another agent's image run, so no live run was made. Owed:

- `test/scenarios/v30-19-opening-hook.json` (written, not run): no-model lane, group `Group: Arin, DM Narrator`; asserts opener → entering line → hook order, each counter once, and the one-shot direction gone after the hook.
- Real-LLM journey on adolion-fresh, twice: fresh chat produces the opener and a non-lead hook addressing the player before the first send; `so-talk-metrics.mts` on the chat files; a turn where a chained voice asks the player ends the chain (one generation saved); a swipe of the hook keeps its direction.
- Payload check: the one-shot line appears only in the hook member's generation.
- Blind pacing rating pair (with and without hook) before the campaign adopts hooks broadly.

## Unresolved questions

- Does the owner want hooks at chapter openings as well as story starts (campaign pass proposes 63)?
- Should a hook be allowed in `player_action` beats as a question, or only as an offer? (Built: a question, never "what do you do".)
- Should `yield_on_question` also end a chain on an implicit invitation (no `?`)? Needs the judge signal.

## Gate record

Date 2026-10-26, branch `v3.0-talk-pacing` from master `2403c70f`.

- `npm run gates:quick` green (typecheck, typecheck:test, lint changed, jest related; defect replay `--cached` 32 of 32 killed) before the full run.
- `npm run gates` (no `--resume`, Storybook included): **all green in 286.8 s**.
  - build, typecheck, typecheck:test, lint, debug:typecheck: ok.
  - test (jest): 902 suites passed (1 skipped); 10513 tests passed, 1 skipped.
  - test:replay: defect replay 32 of 32 killed.
  - test:debug: 1572 of 1572 pass. test:plugin and test:release: ok (0 fail).
  - test-storybook:ci: 165 suites, 1004 tests passed (new stories `Studio/CheckpointEditor` AuthorsAnOpeningHook, `Studio/TalkControlEditor` ChainYieldsOnQuestion).
- An earlier full run went red on two environment and code points, both fixed before the green run: `test-storybook:ci` could not bind port 6006 (another agent's static Storybook held it), and `debug:typecheck` failed on an alias import in `talk/asksPlayer.ts` (now alias-free, so `so-talk-metrics.mts` can import it).
- New tests: `talk/asksPlayer.test.ts`, `runtime/talkYield.test.ts`, `runtime/openingHook.review.test.ts`, `runtime/coordinators/oneShotDirection.review.test.ts`, `runtime/talkPacingRewind.test.ts`, `studio/hookDiagnostics.test.ts`, additions to `runtime/effectsApplier.test.ts`, `engine/engine.test.ts`, `studio/diagnostics.test.ts`, `scripts/debug/lib/talkMetrics.test.mts`. Each fix has a test that fails without it (the identity-order, key-collision, two-opener and opener-deferral cases are manager-level in `openingHook.review.test.ts`).
- Census and goldens updated: `test/findings/ownership-sites.json` (speak moved to `npcSpeak.ts#speakGenerated`, `openNewChat` replaced by `OpeningSequence.post` / `.after`), `test/goldens/arrival-findings.json` (+ the new scenario's story, no findings).
- Size guards: `effectsApplier.ts` split (`npcSpeak.ts`, `openingSequence.ts`, `effectsApplierHost.ts`), TalkControl types moved to `engine/talkSchema.ts`, the manager stays at 700 effective lines.
- **Live gate: NOT run, owed, NOT green.** The GPU and lanes were in use by another agent's image run. `test/scenarios/v30-19-opening-hook.json` was written and schema-validated (`validateFixture` returned no problems, the eval pre-check parses) but not run. The real-LLM checks owed are listed under "Live gate".
- Deviations: none from the owner decisions. Added beyond the first brief, at the lead's request after the Astra and Opus reviews: every scripted opener posts, the opener never defers its own beat, `afterSpeak` waits on a question, swipe re-arms a cue, held-opener rollback, one-candidate judge eligibility, direct-address chain routing, the metrics script.

- **Live gate 2026-10-26.** Master `5719c721` (served bundle `6e8dc289`), campaign pin `c5723c5`, local controller (Artemis 31B v1.1, thinking on, `adolion-fresh` preset overlay `thinking`). Lane 33 belonged to another agent's image journey and shared the GPU.

  - No-model scenario: `st-lanes.mts run 35 -- scripts/debug/so-scenario.mts run test/scenarios/v30-19-opening-hook.json --sandbox --group "Group: Arin, DM Narrator"` on offline lane 35: **pass**, 4 of 4 steps (opener row 0, entering line row 1, each counter fired once, one-shot direction gone after the hook; the hook's `/trigger` posts nothing on a no-model lane, as the fixture expects), residue clean. Record `C:/dev/so-lanes/35/debug/runs/2026-10-26T20-31-46-403Z-so-scenario-run/`.
  - Real LLM, `adolion-fresh.mts seed 34` (exit 0, no problems), 5 of 9 stories (the first story and four others), fresh chat each, identity kept through the start pane:
    - Opening: 5 of 5 had exactly 2 rows before the first send, narrator opener then a party member's hook; 0 further voices before the send. 5 of 5 hooks address the player in character and end on a question; 0 "what do you do", 0 decisions or speech for the player. Only 1 of 5 asked a single question; 4 of 5 asked two linked questions (the instruction says one).
    - Hook swipe (3 stories): 3 of 3 regenerated lines still address the player and end on a question, 0 extra rows; 1 of 3 single question. The cue is recorded in `extras.cuedLines` and re-armed on the swipe.
    - Payload (persisted tail, one story): the one-shot direction is in the hook member's reply generation (1 of 1), not in the next reply (0 of 1), not in any side pass (0 of 11).
    - Player turns: 12 `send` turns (2-3 per story, 1 in the fifth). Party questions to the player inside a turn: 3, chain stopped after each (3 of 3); hand-back source rules 2, judge 7, no hand-back decision (chain cap) 3. One rules miss: a question without "you" or the player's name, handed back by the judge (documented false negative).
    - Agency: 26 generated party lines in turns, 0 invented player speech or decisions; 2 borderline (a companion accepting on the party's behalf; a desk officer acting on the player's own proposal).
    - Instructions in effect: 8 of 8 llm NPC replies with an instruction (5 hooks + 3 swipes) followed it (one quiet question in the stated situation). No other llm NPC reply fired in these turns.
  - `so-talk-metrics.mts` (per chat, `--lead` narrator, `--cast` the group): opening hook rate 5/5 = 1.0; turns to first address 1 in 5 of 5; yield after a question 8/8 = 1.0; voices per send mean 1.67 over 12 sends (per story 1.33, 2.33, 1.67, 1.5, 1.0; max 3; scripted narrator beats count); party share 0.77 over 30 AI lines; narrator words p50 64-67 (one story 186, its opener).
  - Floors (informational): hook rate >= 0.95 met; turns to first address <= 2 met; yield integrity >= 0.97 met; party share >= 0.3 met; voices per send in [1.3, 2.2] met overall (one story 2.33); "ask one thing" quality below Astra's 90% bar on single-question wording (2 of 8 lines).
  - Cost: hook generation 20.7, 41.5, 80.6, 32.9, 29.2 s (median 32.9 s); swipes 44.2, 16.5, 126.4 s. The 80.6 and 126.4 s ran under GPU contention with the other agent's image run.
  - Environment, not this plan: the controller wedged for about 45 min. After an image swap the sleeping text server (memberCache.keepAcrossImages, `a1b20afa`) still held about 21 GB of VRAM, so residency refused to wake it (`policy.mjs:6` Insufficient GPU headroom) and the image free path blamed ComfyUI (`imageCache.mjs:26-29`, `:50`); lanes 33 and 34 both got 409s and one player turn got no reply (its line was deleted and resent). Cleared with `scripts/local/cli.mjs unload` then `automatic`; no config change. Later the lane page stuck at "Initializing…" after an unexpected reload; lane restarted, chat files intact.
  - Run header: `so-run-header diff` with the open-chat change and the 5 owned chats declared leaves one undeclared item, `thirdParty.installed` lost 3 extensions mid-run (the ST tree's global third-party dir changed at 22:19Z, not by this run).
  - Evidence: `C:/dev/so-lanes/34/debug/runs/2026-10-26-v3019-live/` (`summary.json` counts, `metrics/`, payload tail, run headers), archived in so-sessions `evidence/phase-c/v3019-live-2026-10-26/` (commit `9c68fc41`).
  - Not run: the journey twice (one pass per story only), 4 of 9 stories, blind pacing rating pair. Verdict: live gate **green on the checks run** (opening order, hook addressing, swipe, one-shot scope, yield, agency); single-question wording is a quality miss to raise with the owner, not a gate failure.
