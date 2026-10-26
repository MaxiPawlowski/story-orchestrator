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

- `afterSpeak` never follows a story-posted line, and can lose a race with a chain's next voice (it then waits for the next turn). Since stage 2 both draw on one speech budget, so the race can no longer exceed it; in-flight reservations count.
- A held entering set and the cued-line re-arm are in memory for the current apply; a page reload between the opener and its held lines loses the held lines (the opener's own counters persist, so nothing posts twice).
- The yield detector misses implicit invitations without a question mark; false negatives keep today's behaviour.

## Next stage (after stage 2)

Built in stage 2 (below): the shared speech budget, stable reply ids and scopes, pacing profiles, spotlight substitution, address-the-player beats, reaction beats. Still open:

- Route NPC `llm` replies through the guarded `startVoice` (they still use `/trigger`; the budget now bounds them, the busy/draft guard does not).
- A hard narrator message cap separate from the budget (today: the budget caps every automatic voice, and `no_repeat` keeps the lead to one line per chain).
- Zero-cost idle nudge (UI offer only; generation on the player's request).
- Narrowing the global closing-question clause by speaker (review P3, Opus P12): blind A/B first.
- Judge `turn: player` signal (needs a calibration row).
- Record every chain end reason (question, cap, script end, transition, cancel, budget).

## Stage 2 (branch `v3.0-talk-pacing-s2`, worktree `C:\dev\so-talk2`, from master `5719c721`), not merged

### Decisions (owner, as recommended, 2026-10-26)

1. Narrator length and the spotlight default belong to pacing profiles. No profile = today's behaviour (no spotlight, no address beats, no reactions, no length hint).
2. No wall-clock idle nudge (not built; the zero-cost offer stays optional and open).
3. Thinking and the inner voice stay on. Length is a prompt-side hint only, never `max_tokens`.
4. Never narrate the player's decisions: every new one-shot direction carries `ONE_SHOT_SCOPE`.
5. The global "no closing question" agency wording is unchanged (blind A/B later).
6. Cost: every addition replaces or rides a voice except the reaction beat (at most one, budgeted).

Lead decisions recorded here (state them to the owner):

- **Default budget preserves today's shape.** A beat with `talk_control` and no `budget` gets `voices` = the resolved chain `max` (1 with `chain: false`) plus one when the beat has an enabled `afterSpeak`/`sceneBreak` line; `attempts` = `voices` + 1. Only a turn that used to exceed that (a full chain plus two NPC lines in one player message) is now cut. A beat without `talk_control` has no budget unless the story sets `talk_defaults`.
- **Entering lines are the entry sequence.** `onEnter` lines (opener, hook, entering lines, earned effect lines) are recorded with origin `entry` and never draw on the per-send budget.
- **Default cooldown is 2 player turns** for `afterSpeak`/`sceneBreak` (was 8 messages, `NPC_REPLY_SPACING`), 0 for `onEnter`. `test/scenarios/plan07-memory.json` was moved to player lines.
- **Reply keys stay the stage 1 keys.** Without an `id`, a reply is keyed `checkpoint:trigger:member:index` exactly as before; an authored `id` keys it `checkpoint:id`. Duplicate ids in one beat are a load error.
- **Reaction runs only in a director chain**, after the yield checks, before the judge, at most once per consequential event (`boundary@message`), and yields after.
- **Spotlight replaces only judge/director picks** (never a `mention` addressee, never the first voice, never a scripted chain step).
- **Address beats ride the first voice too**, when the first pick is a non-lead member; otherwise the next chain voice.

### Schema (new keys)

- `checkpoints[].talk_control.profile`: `opening | conversation | decision | action | aftermath`.
- `checkpoints[].talk_control.budget`: `{ voices (1-8), attempts (1-12, >= voices) }`.
- `checkpoints[].talk_control.lead_words`: 30-600, soft length target for the lead.
- `checkpoints[].talk_control.spotlight`: `{ quiet_after (1-20 player turns), members? }` or `false`.
- `checkpoints[].talk_control.address_player`: `{ after_player_turns (0-20, required), by?: "relevant_member" | [members], cooldown_player_turns? }` or `false`.
- `checkpoints[].talk_control.reaction`: `true`, `{ members? }` or `false`.
- `talk_defaults` (story): `{ profile?, budget? }`.
- `effects.npc_replies[].id`, `.once_per` (`story | entry | player_turn`, default `story`), `.cooldown_player_turns` (0-20).

Profiles (`talk/policy.ts` `TALK_PROFILE_SHAPES`; checkpoint fields > checkpoint profile > story `talk_defaults` fields > story profile > legacy):

- opening: 2 voices, lead first, lead ~180 words, address after 1 (cooldown 2), no spotlight, no reaction.
- conversation: 3 voices, lead not first, ~120 words, spotlight after 2, address after 3 (cooldown 3), reaction.
- decision: 2 voices, lead first, ~140 words, nothing else.
- action: 3 voices, lead first, ~160 words, spotlight after 3, reaction.
- aftermath: 2 voices, lead not first, ~100 words, spotlight after 1, address after 2 (cooldown 4), reaction.

Example:

```json
"talk_defaults": { "profile": "conversation" },
"checkpoints": [{ "id": "crossroads", "talk_control": {
  "lead": "Ruins Narrator", "speakers": [{ "member": "Ruins Narrator" }, { "member": "Mara" }, { "member": "Finn" }],
  "director": true, "profile": "decision", "budget": { "voices": 2, "attempts": 3 }, "lead_words": 120,
  "address_player": { "after_player_turns": 2, "by": ["Mara"], "cooldown_player_turns": 3 }, "reaction": { "members": ["Finn"] }
}, "effects": { "npc_replies": [
  { "trigger": "afterSpeak", "member": "Finn", "kind": "llm", "id": "finn-aside", "after_member": "Mara", "once_per": "entry", "maxTriggers": 1, "cooldown_player_turns": 2,
    "instruction": "Finn grumbles about the weather." }
] } }]
```

### What was built

- **Speech record and budget** (`runtime/speechLedger.ts`, `runtime/speechBudget.ts`, `runtime/speechWiring.ts`). Every automatic request is a `SpeechRequest`: origin (`chain | npc | entry | spotlight | address | reaction`), member, generated, source message id + revision, entry identity (`checkpoint@startedMessageId`), recipient, instruction, `yieldAfter`, optional cause. `reserve` counts rendered voices since the player's latest line from the chat (entry lines excluded) plus in-flight reservations, and generations separately (scripted lines cost a voice, not a generation; a failed generation costs one). Settled requests land in `extras.speech` (cap 200) with message id, revision and word count; a settle after a chat switch records nothing. Refusals are journaled ("held by the speech budget").
- **Chain integration** (`runtime/talkControl.ts`, `runtime/talkPacing.ts`, `runtime/talkDirector.ts`). Each chain voice reserves before its trigger; a refused reservation ends the chain. A rendered `yieldAfter` voice (address, reaction, an NPC `ask_player` line) ends the chain with a recorded hand-back. Judge and director calls moved to `talkDirector.ts` (file budget); `leadPreferred: false` drops the lead from the judge/director input and from the rules' lead eligibility.
- **NPC replies** (`runtime/effectsApplier.ts`, `runtime/npcSpeak.ts`, `runtime/npcReplyRewind.ts`). `afterSpeak`/`sceneBreak` lines reserve from the same budget; `onEnter` lines record entry events. `npcReplyMayFire` takes the reply and a scope view (entry start, latest send, player turn ids); `npcReplyKey` keys by id.
- **Spotlight**: substitutes the judge/director pick with the quietest eligible member (quiet = player turns since they last spoke in this beat, read from the chat), seeded ties, one-line private nudge (`SPOTLIGHT_DIRECTION`), decision source `spotlight`.
- **Address-the-player**: due when no non-lead line asked the player (the stage 1 `asksPlayer`) for `after_player_turns` and the last address event is at least `cooldown_player_turns` behind; arms `ASK_PLAYER_DIRECTION` (or the tail) on the planned voice; 0 extra calls.
- **Reaction**: consequential = fired transition, quest closed/rewarded, check rolled since the player's line (`runtime/speechConsequence.ts`); `REACTION_DIRECTION`, decision source `reaction`.
- **Lead length**: `leadLengthLine` in the lead's own draft of the guidance block (`pacingCoordinator` `leadLength` dep).
- **Rollback**: `rewindSpeech` in `rollback.ts` quarantine (drop at/after; swipe/edit keep the message's own row; delete shifts); directed chain voices are also recorded as cued lines, so a swipe keeps the direction.
- **Authoring**: validation (`validate/talkPacing.ts`), storyDiff (`talk-defaults-changed`, roster refs), diagnostics `talk-budget-below-chain` (warning), `talk-pacing-no-room` (warning), `npc-reply-scope-unused` (info), and pacing member names under `talk-member-unknown` (`studio/talkDiagnostics.ts`); Studio `TalkPacingFields` (profile, budget, lead words, spotlight, address, reaction, effective-policy line), `NpcReplyScope` (id, at most N per scope, cooldown), story default profile/voices; wizard parser (`copilot/parseFields.ts`); guide topic `talk-pacing` + `npc-replies` update (story-guide.md, `copilot/guideTopicsTalk.ts`, `npm run docs:guide`), guide coverage tables for `talk_control`, `talk_defaults`, `npc_replies[]`.
- **Metrics** (`scripts/debug/so-talk-metrics.mts`): `--budget` (per-round compliance), `--lead-words` (lead lines within 1.25x target), spotlight share, longest party gap, longest quiet run per member, and the chat file's speech record (events by origin, failed attempts, max voices per send).
- **Scenarios (written, NOT run)**: `test/scenarios/v30-19s2-speech-budget.json`, `-reply-scope.json`, `-profile.json`, `-address-player.json`, `-reaction.json`, `-spotlight.json` (no-model lane, group `Group: Arin, DM Narrator`, schema-validated). The address, reaction and spotlight ones assume the no-model lane completes the group wrapper on an empty reply; the spotlight substitution itself needs three members and is covered by `runtime/talkPacing.review.test.ts`.

### Live gate stage 2 (owed, NOT green)

- Run the six stage 2 scenarios on a no-model lane, twice (`so-scenario run <file> --sandbox --group "Group: Arin, DM Narrator"`).
- Real-LLM on adolion-fresh, after the campaign pass: a `conversation` beat for 10 player turns: `so-talk-metrics.mts --budget 3 --lead-words 120` shows budget compliance 100%, every member speaking within 4 player turns, lead p90 within target; the speech record shows no send over its voices/attempts.
- A `decision` beat: at most 2 voices per send, the lead first, no address beat.
- An address beat: the non-lead voice asks the player one thing and the chain stops; payload check that the one-shot line reaches only that member's generation.
- A reaction beat after a transition with `stop_on_transition: false`: exactly one reaction, then the player's turn.
- Swipe and delete on a directed voice: the direction re-arms on swipe; a delete drops its speech row and re-opens the budget.
- Blind pacing rating pair (profile vs no profile) before the campaign adopts profiles broadly.

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
- Stage 2: should a beat with `talk_control` and no profile get a default profile (e.g. `conversation`), switching spotlight on everywhere? Built: no (profiles decide, per the owner decision); the campaign pass can set `talk_defaults`.
- Stage 2: is the 2-player-turn default cooldown for `afterSpeak`/`sceneBreak` right, or should it stay closer to the old 8 messages?
- Stage 2: should spotlight be allowed to bring in the lead when the author lists the lead in `spotlight.members`? Built: the lead is never a spotlight pick.

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
