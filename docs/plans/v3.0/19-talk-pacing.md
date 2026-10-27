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
- **Main bundle**: the budget (`speechBudget.ts` + `talk/policy.ts`) loads as the lazy `speechUnit` chunk and the chain pacing as a lazy `talkPacing` chunk (both imported at startup; until they land, nothing is budgeted or substituted and no request is refused); the pacing validators ride the game layer, so a story using any stage 2 key loads it (`usesGameLayer`). Main bundle 1,293,742 B (base 1,281,363 B, budget 1,300,000 B).
- **Metrics** (`scripts/debug/so-talk-metrics.mts`): `--budget` (per-round compliance), `--lead-words` (lead lines within 1.25x target), spotlight share, longest party gap, longest quiet run per member, and the chat file's speech record (events by origin, failed attempts, max voices per send).
- **Scenarios (written, NOT run)**: `test/scenarios/v30-19s2-speech-budget.json`, `-reply-scope.json`, `-profile.json`, `-address-player.json`, `-reaction.json`, `-spotlight.json` (group `Group: Arin, DM Narrator`, schema-validated). Budget, reply scope and profile are no-model; address, reaction and spotlight use `send_generate`, so they are model-lane (`model: any`), with the talk director mocked and assertions on code-made records only. The spotlight substitution itself needs three members and is covered by `runtime/talkPacing.review.test.ts`.

### Live gate stage 2 (run 2026-10-27, NOT green: see the Gate record)

- Run the three no-model stage 2 scenarios on a no-model lane and the three model-lane ones on a model lane, each twice (`so-scenario run <file> --sandbox --group "Group: Arin, DM Narrator"`).
- Real-LLM on adolion-fresh, after the campaign pass: a `conversation` beat for 10 player turns: `so-talk-metrics.mts --budget 3 --lead-words 120` shows budget compliance 100%, every member speaking within 4 player turns, lead p90 within target; the speech record shows no send over its voices/attempts.
- A `decision` beat: at most 2 voices per send, the lead first, no address beat.
- An address beat: the non-lead voice asks the player one thing and the chain stops; payload check that the one-shot line reaches only that member's generation.
- A reaction beat after a transition with `stop_on_transition: false`: exactly one reaction, then the player's turn.
- Swipe and delete on a directed voice: the direction re-arms on swipe; a delete drops its speech row and re-opens the budget.
- Blind pacing rating pair (profile vs no profile) before the campaign adopts profiles broadly.

### Stage 2 live-gate fixes (branch `v3.0-talk-s2-fixes`, worktree `C:\dev\so-talkfix`, from master `c0b3c67c`), not merged

Owner direction for 5 (as recommended); the rest are defects from the stage 2 live gate.

1. **Every directed first voice carries its beat, on either path** (`runtime/talkControl.ts` `firstVoice`, `startFirst`). The first voice of a player message is planned once per pass (`chain.first`: spotlight, then address), whichever member ST drafted. When ST drafts that member, the plan reserves, arms and starts in `intercept`; when ST drafts someone else, the pass is aborted and the reconcile triggers the planned member through the same `startFirst` (was: the decided member, plain, no reservation, no speech row). A plain first voice now reserves and writes its speech row too (`origin: chain`), so every directed voice has a record. A refused reservation still lets the player's first reply run, plain. Test: `runtime/talkPacing.review.test.ts` "fix 1".
2. **A posted note is never a player turn** (`runtime/playerSend.ts`, `wiring/generation.ts`, `effectsApplier.ts` `announceText`). ST's `MESSAGE_SENT` carries the row index for `/send`, `/sys`, `/comment` and the player's own line alike (`script.js:5917`, `slash-commands.js:6063`, `:6149`). The talk chain's yield and the lore pick now run only for a row with `is_user: true` and not `is_system`, and never while our own posting path is open (`ownPost()` around the transition note's `/comment`). `HostEventPayloads.MESSAGE_SENT` is typed as the index. Checked, unchanged: player-turn counting for cooldowns, quiet runs and the budget already read `is_user && !is_system` rows (`talk/participation.ts`); TurnBridge commits boundaries only on `MESSAGE_RECEIVED`/`CHARACTER_MESSAGE_RENDERED`, which `/comment` does not emit (host fact row `slash-commands.js:6113`), and its `MESSAGE_SENT` handler only refreshes row identity, clears a stale regeneration mark and releases a stopped reply (right for any new row); stage 1 hooks read the chat, not the event. Polish still abandons a candidate on any `MESSAGE_SENT` (conservative, unchanged). Tests: `runtime/wiring/playerSend.review.test.ts`, `effectsApplier.test.ts` "fix 2", `loreForceWiring.review.test.ts` fixture now has a user row at the sent index.
3. **A swipe keeps the voice's speech row** (`runtime/spikes/swipeBack.ts`, on by default). Root cause: on a new swipe ST emits `MESSAGE_SWIPED` with `swipe_id` one past the stored swipes and the old text still in `mes` (`script.js:10397-10400` sets `swipe_id`, `animateSwipe` emits at `:10315` before `Generate('swipe')`). The swipe-back cache keyed that old text, so it hit, restored the old record (a same-chat hydrate, "Continuing …") and skipped the swipe rollback; the new reply then drifted from the restored fingerprints and was rolled back as an eventless change with no kind, dropping the message's own speech row, cue and NPC counters. The cache now looks up only a row showing one of its stored swipes (`showsStoredSwipe`), and never captures while a new swipe is generating (it was caching the post-rollback state under the old text, so a later swipe-back restored the wrong state). The swipe goes through the ordinary `swipe` rollback, which keeps the row (the slot stays used, the reaction cause stays handled, the address cooldown holds); a delete still drops it and reopens the budget. The spike harness's `newSwipe` now matches ST (it used to blank `mes` first, which hid this). Tests: `spikes/swipeBack.review.test.ts` "fix 3" (fails without the seam guard), SP1 S1 (560 of 800 cuts unequal without the capture guard), `speechBudget.test.ts` "fix 3".
4. **Role macro names are sanitized** (`runtime/macros.ts` `roleMacroName`): characters other than letters, digits, `_`, `-` become `_` (ST's identifier pattern `MacroLexer.js:17`), case kept; two ids that sanitize alike register once, for the first. Registration and the dispose list use the same name. Guide macro table updated. Test: `macros.test.ts` "fix 4".
5. **Spotlight may take the first voice** (`runtime/talkPacing.ts` `firstSpotlight`). Same pool as the chain spotlight (never the lead, `members` honoured, seeded ties), plus: only a member quieter than the pick takes it, never when the player's line names or addresses any member, never from a `mention` decision, never in a scripted chain, and never from the lead when the profile puts the lead first (`leadPreferred`, i.e. no profile, `opening`, `decision`, `action`). It replaces, never adds, and reserves from the budget like any first voice. Test: 4-member group, `conversation`, judge always picks the lead and hands back: 10 player turns, one voice each, every member (lead included) speaks in every window of 4 player turns; controls: spotlight off gives the lead every turn, a named lead is kept, the `action` lead keeps the first voice.
6. **One-question close** (`pacing/guidance.ts` `ONE_QUESTION_CLOSE`, `asksPlayerDirection`): when the armed one-shot direction asks the player (`ASK_PLAYER_DIRECTION`, or a direction ending in `ASK_PLAYER_TAIL`), the asking member's guidance block ends with "End with exactly one question. Do not ask a second question." (last line, after the agency clauses). Model output is not rewritten. **A blind check is owed** (single-question rate and naturalness, before vs after), and the live rate must be re-measured. Test: `oneShotDirection.review.test.ts` "fix 6".

Lead decisions (state them to the owner):

- A plain first voice now writes a speech row (`origin: chain`); stage 2 recorded only directed second+ voices and address first voices. Metrics that count events by origin will show one more `chain` row per player message.
- First-voice spotlight requires the substitute to be quieter than the pick, and leaves a lead-first profile's lead alone; without these the lead starved in the 4-member test (spotlight fired every turn after the second).
- The eventless-change path itself is unchanged: a swipe that ST performs while this page is not listening still rolls back without a kind (drops the row). Not seen live after the cache fix; open.

Live re-check owed (lane, real model):

- Address beat in a 4-member group where ST's own activation drafts a different member than the director (about half of turns): the address direction reaches the decided member's generation, `extras.speech` has its `address` row with the message id, and the chain stops after it; repeat until both paths are seen at least twice.
- Transition note on (`display.announceTransitions`) with a reaction beat after a fired transition (`stop_on_transition: false`): the in-flight voice keeps its one-shot direction in its prompt, its speech row has a message id (no failed attempt), and the reaction still fires once.
- Swipe a spotlight or address voice and a hook: journal shows no "eventless change" and no "Continuing …" hydrate; the voice's `extras.speech` row survives with the same message id; the direction re-arms; a second swipe-back to the first text still restores (swipe-back cache hit); a delete drops the row and a probe reservation is admitted again.
- Toy group with a roster id containing a space: no macro registration console error; `{{story_role_<sanitized>}}` resolves.
- `conversation` beat, 10 player turns, 4-member toy group: `so-talk-metrics --budget 3 --lead-words 120` shows budget compliance 100% and every party member speaking within 4 player turns; spotlight decisions on chain step 0 appear; no send over budget.
- Campaign hooks (3 stories, first + swipe): single-question rate with the close line (target 4 of 5), plus the owed blind check.
- Stage 1 regression: opening hook order, yield on question, afterSpeak cooldown in player turns.

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

### Gate record, stage 2

Date 2026-10-26, branch `v3.0-talk-pacing-s2` from master `5719c721`.

- `npm run gates:quick` green before the full run (typecheck, typecheck:test, lint changed, jest related, defect replay `--cached`).
- `npm run gates` (no `--resume`, Storybook included): **all green in 260.1 s**.
  - build, typecheck, typecheck:test, lint, debug:typecheck: ok.
  - test (jest): 910 suites passed (1 skipped); 10564 tests passed, 1 skipped.
  - test:replay: defect replay 32 of 32 killed.
  - test:debug: 1574 of 1574 pass. test:plugin and test:release: ok (0 fail).
  - test-storybook:ci: 166 suites, 1006 tests passed (new stories `Studio/TalkControlEditor` PicksPacingProfile, `Studio/NpcReplyScope` ScopesAReplyPerVisit).
- Earlier full runs went red and were fixed before the green run: main bundle over budget (1,305,422 B; fixed by the lazy `speechUnit` and `talkPacing` chunks and game-layer validators, now 1,293,742 B), `legacyFree` and `errorCopy` guard rows (word renamed; two parseFields issue templates listed in `test/findings/errorCopy.json`), a Storybook query that matched the profile tooltip, and the model-class census (address, reaction, spotlight scenarios use `send_generate`, so `model: any`, lane `model`). The first full run waited for another worktree's Storybook to free port 6006.
- New tests: `talk/policy.test.ts`, `talk/participation.test.ts`, `engine/validate/talkPacing.test.ts`, `runtime/speechBudget.test.ts` (budget, ledger rollback), `runtime/npcReplyScope.test.ts` (ids, scopes, cooldowns, rollback = replay, consequential events), `runtime/talkPacing.review.test.ts` (budget stops the chain, spotlight substitutes, address rides, cooldown, reaction, lead preference), `copilot/parseFieldsTalk.test.ts`, additions to `runtime/effectsApplier.test.ts`, `runtime/coordinators/oneShotDirection.review.test.ts`, `studio/diagnostics.test.ts`, `copilot/guideCoverage.test.ts`, `scripts/debug/lib/talkMetrics.test.mts`.
- Goldens and findings: `test/goldens/arrival-findings.json` (+6 scenario stories, no findings), `test/findings/errorCopy.json` (+2 rows).
- **Live gate: NOT run at merge** (dev only, lanes in use). Run 2026-10-27, below.
- Deviations: the default `afterSpeak`/`sceneBreak` cooldown moved from 8 messages to 2 player turns (stated above); NPC `llm` replies still use `/trigger`, not `startVoice` (open).

- **Live gate stage 2, 2026-10-27.** Master `43c8121c` (HEAD `07013885`, docs only; served `dist/index.js` sha256 `8fa902e6`), campaign pin `c5723c5`, local controller (Artemis 31B v1.1, thinking on, preset overlay `thinking`). No-model lane 33, model lane 34 (`adolion-fresh.mts seed 34`, 0 problems, 0 drift). No controller 409s.
  - No-model scenarios, `st-lanes.mts batch --lanes 33 --repeat 2 --strict --group "Group: Arin, DM Narrator"`: speech-budget 2/2, reply-scope 2/2, profile 2/2.
  - Model scenarios on lane 34 (`--model any`): spotlight 2/2; address-player 1/2 in the batch, 1/2 more with `--keep` (product defect 1 below); reaction 0/2 as written (fixture: `/cp set` commits its own boundary, so the transition fired before the player's line and was not a consequence of the answer). Fixture fixed in this commit (the write is queued, and `chain.yield_on_question: false`, because the yield check runs before the reaction and a narrator question to the player skips it by design, 1 of 3 runs): **2/2 green** (batch).
  - Neutral test story (not committed, lane debug dir), toy group of 4 (lead + 3), real model, no mocks. Living director and branching moved the beat into generated checkpoints in the first two chats; the conversation chat ran with both off for that chat.
    - Decision beat, 4 sends: at most 2 voices 4 of 4 (one third voice held by the budget), lead first 2 of 4 (the director picked an addressed member once and another member once: `leadPreferred` is a director hint, not a rule), address events 0.
    - Reaction after a fired transition (`stop_on_transition: false`), 2 runs: exactly one reaction 2 of 2, then the player's turn. Clean run: the reaction direction is in the reacting member's reply generation only (1 of 1). Other run: the transition note cut the chain (defect 2).
    - Conversation beat, 10 player turns: voices per send 1,1,1,1,1,1,1,1,1,3 (mean 1.2); budget compliance 10/10 (`so-talk-metrics --budget 3 --lead-words 120`), no send over budget; 2 address beats, each on a non-lead member, chain stopped both times, 1 of 2 a single question; 1 spotlight substitution (the quietest member for the director's pick, budget kept); lead lines 4, 37-57 words (target 120; all within the 1.25x ceiling, about 45% of target). Longest quiet run per party member 4, 4 and 9 player turns: **not** every member within 4, because the director hands back after one voice in 9 of 10 sends and spotlight only replaces a chain's second or later voice.
    - Payload: each one-shot line reached only its member's reply generation (address 2 of 2, spotlight 1 of 1, reaction 1 of 1), 0 side passes.
    - Delete of a chain voice: its speech row dropped; a reservation probe was refused before (3 of 3 voices) and admitted after.
    - Swipe of the spotlight voice: the direction re-armed in the swipe generation (1 of 1), but the voice's own speech row was dropped (defect 3).
  - Campaign regression, 3 stories (fresh chat each, identity kept): opening lead line then a party member's hook, 0 further voices before the send, 3 of 3. The new hook wording reached 5 of 5 hook generations (3 first, 2 swipes) and no other generation. Single question 2 of 5 (first 1 of 3, swipes 1 of 2); target 4 of 5 **not met** (stage 1: 1 of 5 first, 1 of 3 swipes). Hook swipes still address the player 2 of 2. 6 player turns: voices per send 1,1,2,2,1,1 under default budgets 4, 3, 3 (chain max 3, +1 where the beat has an `afterSpeak` line); 0 held, 0 speech or decisions for the player.
  - Behaviour vs stage 1: a scripted `afterSpeak` narrator line fired on the second player turn after the hook (cooldown is now 2 player turns, was 8 messages), inside the budget.
  - Defects:
    1. Address-the-player rides the first voice only when ST's own activation drafted the decided member (`runtime/talkControl.ts:227`). When ST drafts someone else, the pass is aborted and the reconcile triggers the decided member (`talkControl.ts:262`) without `rideFirstVoice`, so no address beat, no reservation and no speech row for that voice. About half the runs in a 4-member group.
    2. The transition note (`/comment`, `display.announceTransitions`, on in the owner's install) emits `MESSAGE_SENT`, which the wiring treats as a player message (`runtime/wiring/generation.ts:147` -> `talkControl.ts:178` `yieldToPlayer`): an in-flight chain voice loses its one-shot direction (the reaction reply had none in its prompt) and its speech row is recorded as a failed attempt with no message.
    3. A swipe of a generated reply is rolled back as an "eventless change" from a same-chat hydrate (`runtime/chatSave.ts:169`, no mutation kind), so `rewindSpeech` drops that message's own row (`runtime/speechLedger.ts:51`); seen 3 of 3 swipes (a spotlight voice, two hook entry rows). It can unmark a handled reaction cause or an address cooldown.
    4. Minor, older: a roster id with a space registers an invalid macro `story_role_DM Narrator` (`runtime/macros.ts:26`), console error on every toy-group scenario.
  - Run header: `so-run-header diff` differs only in this run's owned chats and stories (removed from the lane library after).
  - Evidence: `C:/dev/so-lanes/34/debug/runs/2026-10-27-v3019s2-live/` (`summary.json` counts, metrics, turns, payload tail, run headers), archived in so-sessions `evidence/phase-c/v3019s2-live-2026-10-27/` (whole lane `server.log` files dropped, per-row slices kept).
  - Not run: blind pacing rating pair; a `conversation` beat on the campaign (keys not adopted).
  - Verdict: **budget, reply scopes, profiles, spotlight substitution, reaction, delete and payload scoping green on the checks run; NOT green overall**: address beat flaky (defect 1), transition note breaks a directed chain voice (defect 2), swipe drops the speech row (defect 3), party coverage within 4 player turns missed, hook single-question 2 of 5.

### Gate record, stage 2 live-gate fixes

Date 2026-10-27, branch `v3.0-talk-s2-fixes` from master `c0b3c67c`.

- `npm run gates:quick`: red twice (lint max-len in `guideTopicsTalk.ts`; jest: ownership census row `EffectsApplier.announceText` went stale when the `/comment` moved into a wrapper, `loreForceWiring` fixture had no user row at the sent index, SP1 S1 560/800 unequal until capture skipped mid-swipe rows), then green (typecheck, typecheck:test, lint changed, jest whole suite, defect replay `--cached` 32/32).
- `npm run gates` (no `--resume`, Storybook included): **all green in 668.8 s, first run** (no load flake, no rerun): typecheck, typecheck:test, build, debug:typecheck, lint, test (jest), test:replay (32 of 32 killed), test:debug, test:plugin, test:release, test-storybook:ci (166 suites, 1006 tests). Main bundle 1,294,997 B (budget 1,300,000 B). Docs-only edits after the run (this record).
- New tests: `runtime/wiring/playerSend.review.test.ts`; additions to `runtime/talkPacing.review.test.ts` (fix 1, fix 5), `spikes/swipeBack.review.test.ts` (fix 3), `speechBudget.test.ts`, `macros.test.ts`, `coordinators/oneShotDirection.review.test.ts`, `effectsApplier.test.ts`. Each fails without its fix (checked by stashing the source change). Three stage 2 expectations now include the first voice's `chain` row.
- Guide: `story-guide.md` (spotlight first voice; a posted note ends no chain), `guideTopicsTalk.ts`, `docs/guide/author/macros-and-commands.md`, `npm run docs:guide`. No settings changed.
- **Live gate: NOT run** (no GPU/lanes for this task). Owed: the "Live re-check owed" list above. Not green until it runs; single-question blind check owed.

### Gate record, live re-check stage 2

- **Live re-check stage 2, 2026-10-27.** Master `2bb4bf8f` (served `dist/index.js` sha256 `3a25d212`, unchanged through the run; master moved to `21a037f9` mid-run, not served), campaign pin `c5723c5`, local controller (Artemis 31B v1.1, thinking on, MTP draft, preset overlay `thinking`; no 409, `lastError` null). No-model lane 33, model lane 34 (`adolion-fresh.mts seed 34`: 0 problems, 0 drift). Transition note on (lane setting `display.announceTransitions` true).
  - Six stage 2 scenarios, once each (`st-lanes.mts batch --repeat 1 --strict --group "Group: Arin, DM Narrator"`): speech-budget 1/1, profile 1/1, address-player 1/1; reaction red once (`send_generate` 60 s timeout: two voices plus the inner beat on one GPU), then 1/1; spotlight red once (`schedulerIdle` 30 s wait, heavy pass in flight), then 1/1; reply-scope red 2/2 as written (fixture: the living director's way-in keeps the heavy lane busy past step 11's 30 s `schedulerIdle` wait), green 1/1 with living and branching off for the chat.
  - Stage 1 regression: `v30-19-opening-hook.json` 1/1 (lane 33); an afterSpeak line with the default cooldown (copy of the reply-scope fixture, `maxTriggers` 10, living off) fires on player turns 1 and 3 of 4 (cooldown counted in player turns).
  - Neutral test story (not committed, lane debug dir), toy group of 4 (lead + 3), lead roster id with a space, living and branching off per chat, real model, no mocks; first-voice path read from host events (`GENERATION_STARTED` `force_chid`).
    - Role macro: `{{story_role_<sanitized>}}` resolved in 4/4 setups; 0 console or page errors over 95 captured command windows (the scenarios' `DM Narrator` id registered `story_role_DM_Narrator`, no error).
    - Address beat (`address_player` after 1, cooldown 1), 8 sends: address on the first voice 8/8, intercept path 4, reconcile path 4; speech row `address` with a message id 8/8; chain stopped after it 8/8; direction only in the addressee's reply generation 8/8, one-question close line in it 8/8; single question 8/8.
    - Reaction after a fired transition (`stop_on_transition: false`, transition note on), 2 runs: note between the voices 2/2, exactly one reaction 2/2, reaction direction in the reacting member's reply generation only 2/2, reaction row with a message id 2/2, 0 failed attempts.
    - Conversation beat, 10 player turns (`so-talk-metrics --budget 3 --lead-words 120`): voices per send 1,1,1,1,1,1,1,1,2,3 (mean 1.3); budget compliance 10/10, no send over budget, 0 failed attempts; longest quiet run per party member 4, 4, 4 player turns (every member within 4); spotlight decisions on chain step 0: 5, on later steps: 2; address beats 3; lead lines 2 (100, 126 words, within the 1.25x ceiling).
    - Payload: 19 directed reply generations, 0 with a direction for another member, 0 side passes with a direction.
    - Swipe of a spotlight voice and of an address voice: no "eventless change" and no "Continuing" on the new swipe 2/2; speech row kept with the same message id 2/2; direction re-armed in the swipe generation 2/2; swipe-back to the first text is a cache hit 2/2 (a "Continuing" hydrate on the swipe-back itself, as expected for a hit).
    - Delete of a chain voice: its speech row dropped; a reservation probe refused before (3 of 3 voices), admitted after.
    - Model output: 2 thought-only replies in the conversation chat (one retried, one kept as a 0-word voice).
  - Campaign regression, 3 stories (fresh chat each, identity kept):
    - Opening: lead line then a party member's hook, 0 further voices before the send, 3/3.
    - Hook direction only in the hook generation 7/7 (3 first, 4 swipe generations incl. one empty-reply retry), one-question close line in 7/7.
    - Single question: first 1/3, swipes 3/3, total 4/6 (target 4 of 5 rate **not met** on firsts; stage 2 run 2 of 5).
    - Hook swipe: row kept with the same message id 3/3, direction re-armed 3/3, no "eventless change"/"Continuing" 3/3 (ordinary `swipe` rollback), swipe-back cache hit 1/1 (the other 2 not possible, see defect 1).
    - 6 player turns: voices per send 2,1,1,1,1,1 under budgets 4, 3, 3; 0 held; yield after a voice's question 3/3.
  - Defects:
    1. A swipe of the opening hook lets a scripted lead line fire between the regenerated hook and the player's first turn: 2 of 3 stories (one `sceneBreak` line by its roll after the re-read flagged a location break, one `afterSpeak` line). The hook's guard is `extras.lastSelfInjectionMessageId` (`runtime/effectsApplier.ts:476-477`), which the swipe rollback clears (`runtime/rollback.ts:116`); the regenerated hook then commits as an ordinary boundary, and `awaitsPlayer` (`effectsApplierHost.ts:34`) did not see the swiped hook's question. New since fix 3: the swipe used to hit the swipe-back cache and commit no boundary.
    2. Fixture: `v30-19s2-reply-scope.json` needs living off (or a longer wait); `-reaction.json` 60 s `send_generate` timeout is tight on the local controller.
  - Run header: `so-run-header diff --served-identity` differs only in this run's owned chats and the campaign chat's persona lock; neutral stories removed from the lane library.
  - Evidence: `C:/dev/so-lanes/34/debug/runs/2026-10-27-v3019s2r-live/` (`summary.json`, turns, swipes, payload tail, metrics, chat files, run headers), archived in so-sessions `evidence/phase-c/v3019s2r-live-2026-10-27/` (whole lane `server.log` files dropped, per-row slices kept).
  - Not run: blind pacing rating pair; single-question blind check; a `conversation` beat on the campaign.
  - Verdict: **fixes 1-5 green live** (address on both paths, transition note no longer breaks a directed voice, swipe keeps the row, role macro, party within 4 player turns with first-voice spotlight); fix 6 below target on first hooks (1/3); **NOT green overall**: defect 1 (hook swipe opens a scripted line before the player's turn), single-question target missed, blind checks owed.

### Gate record, hook swipe fix

Date 2026-10-27, branch `v3.0-hook-swipe` from master `727da9cc`.

- Fix (live re-check defect 1): a swipe or edit of the self-injected message itself keeps `extras.lastSelfInjectionMessageId` (`runtime/rollback.ts` `keepsSelfInjection`): same message, new revision, as a replay would record it. The regenerated hook's boundary then meets the existing guards (`effectsApplier.ts` afterSpeak `=== lastMessageId()`, sceneBreak `=== breakAt`), so no scripted line before the player's first send, swiped or not. A delete, a rollback no event named (eventless hydrate) and a rollback from an earlier message still drop it, so a deleted hook reopens by the existing rules. Chain voices were already safe: a swipe wrapper ends any chain and only a loud user turn opens one (`talkControl.ts`).
- `awaitsPlayer` (`talk/asksPlayer.ts` `lastReplyAsksPlayer`) already reads `mes`, which ST holds as the current swipe's text: no change, pinned by a test. The live afterSpeak miss was the heuristic not reading that swipe's question as one; the identity guard covers it either way.
- Fire records unchanged: a swipe of the posted line itself still re-arms its `firedNpcRepliesAt` row (`lineGone`, T4-1). The opening hook cannot re-post (it needs the opening pass), so not changed here.
- Defect 3 (thought-only replies): `runtime/emptyReply.ts` already swipes once and keeps the second empty reply, matching the live run (one retried, one kept). Nothing to change.
- Fixtures: `v30-19s2-reply-scope.json` switches `living` and `branching` off for the sandbox chat after import (`settingsControl.feature`, as the live green copy); `v30-19s2-reaction.json` `send_generate` timeout 60 s -> 300 s (the common model-scenario value).
- New test `runtime/hookSwipe.review.test.ts` (7): unswiped control; swipe and edit of the hook then a boundary with an afterSpeak and a sceneBreak line present posts nothing; rollback = replay (identity equals a fresh post at that message); delete drops it and the afterSpeak line fires; eventless and earlier rollbacks drop it; awaitsPlayer reads the current swipe. Without the fix 3 fail (swipe, edit, replay), checked by stashing `rollback.ts`.
- `npm run gates:quick`: red once (max-len in `rollback.ts`, moved into a helper), then green.
- `npm run gates` (no `--resume`, Storybook included):
  - Run 1 RED at `test` (755.7 s): `passProfiles.test.ts` census listed `extraction/sharedReadEntry.ts` and `lorebookWriters.guard.test.ts` listed `runtime/copilotProvisioning.ts` / `copilotCoordinator.ts` rows, files in neither this tree nor master (another agent's tree seen through the junctioned toolchain; environment). Both suites pass alone on this tree. All other steps green.
  - Run 2 **all green in 378.4 s**: build, typecheck, typecheck:test, debug:typecheck, lint, test (921 suites, 10663 passed, 1 skipped), test:replay (32 of 32 killed), test:debug, test:plugin, test:release (0 fail), test-storybook:ci (167 suites, 1009 tests).
- Main bundle `dist/index.js` 1,298,676 B (budget 1,300,000 B; +25 B over master 1,298,651 B).
- **Live gate: NOT run** (no GPU/lanes for this task). Owed: the campaign hook swipe re-check (3 stories, swipe then wait for the re-read, then the first send: 0 scripted lines before it), and the two fixtures on lanes.
