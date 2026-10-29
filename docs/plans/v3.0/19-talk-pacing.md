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

- ~~Route NPC `llm` replies through the guarded `startVoice`~~ (stage 3).
- ~~A hard narrator message cap separate from the budget~~ (stage 3, `lead_max_consecutive`).
- Zero-cost idle nudge (UI offer only; generation on the player's request).
- Narrowing the global closing-question clause by speaker (review P3, Opus P12): blind A/B first.
- Judge `turn: player` signal (needs a calibration row).
- ~~Record every chain end reason~~ (stage 3).

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

#### Live gate, hook swipe fix (2026-10-27, merge branch)

- Branch `v3.0-merge-hs-bh` (worktree `C:\dev\so-mergehb`, HEAD `ed58d2aa` = this fix + plan 24 headroom on master `722328c6`), built there; served to the lanes in candidate mode (a CDP route on each lane browser answering `/third-party/story-orchestrator/dist/**` from the worktree `dist/`; in-page `dist/index.js` sha256 `d2726c2ab427` = the worktree manifest; 0 404s; nothing staged into ST, lane 0 untouched). Local controller (Artemis 31B v1.1, thinking on), campaign pin `c5723c5`, model lane 34 (`adolion-fresh.mts seed 34`: 0 problems, 0 drift; restarted `--allow-local`), no-model lane 33. Images and sprites off.
- Hook swipe, 3 campaign stories with an opening hook (fresh chat each, identity kept), wait = scheduler idle + 45 s quiet after each step:
  - Swipe of the hook: 0 scripted lead/afterSpeak/sceneBreak lines before the player's first send, **3/3**; `lastSelfInjectionMessageId` stays on the hook 3/3; the post-swipe re-read ran 3/3 (on one story it flagged a scene break and the scene summary ran: no sceneBreak line, the case defect 1 hit before).
  - Edit of the hook (one story, after its swipe): boundary re-committed, 0 lines, identity kept, 1/1.
  - First player turn after each: one reply, normal chain row, 3/3.
- Fixtures (real controller for the model one): `v30-19s2-reply-scope.json` 2/2 (lane 33, `--sandbox --group "Group: Arin, DM Narrator"`), `v30-19s2-reaction.json` 2/2 (lane 34). 0 page or console errors.
- Defect (pre-existing, not this branch; one unswiped open of 4): a sceneBreak narrator line posted about 24 s after the hook, before the first send. The read of message 0 (the opening lead line) flagged a scene break; its scene summary finished after the hook posted and fired sceneBreak with `breakAt` 0 while `lastSelfInjectionMessageId` was already 1 (the hook). `effectsApplier.ts:477` compares `breakAt` only with the latest self-injection, so a break at an earlier scripted message slips through. Fix candidate: also hold sceneBreak while `lastSelfInjectionMessageId === lastMessageId()` (as afterSpeak does), or while the player has not spoken in a fresh opening. Not fixed here.
- Cleanup: `so-run-header diff --served-identity` on lane 34 differs only in the 4 owned chats and the page's open chat/group/story (declared); lane 33 only the page's open chat. Lanes stopped.
- Evidence: `C:/dev/so-lanes/34/debug/mergehb/` (`campaign/*.json` per step, `reaction-*.log`, `header-*`), `C:/dev/so-lanes/33/debug/mergehb/` (`reply-scope-*.log`), run dirs `C:/dev/so-lanes/3{3,4}/debug/runs/2026-10-27T11-*`. Not archived to so-sessions.
- Verdict: **hook swipe fix green live** (swipe 3/3, edit 1/1, fixtures 2/2 each); the opening sceneBreak guard gap above is open.

### Gate record, opening sceneBreak hold

Date 2026-10-27, branch `v3.0-scenebreak-hold` from `v3.0-d10-wake` `b71c5133`.

- Fix (live gate defect above, 1 of 4 unswiped opens): `effectsApplier.ts` `openingAwaitsPlayer` holds sceneBreak lines while the newest chat message is the story's own self-injected line (`lastSelfInjectionMessageId === lastMessageId()`, the afterSpeak hold) and the player has never spoken in the chat (`playerHasSpoken`, the opening sequence's notion of an opening). A summary of a break at an earlier scripted message (read of message 0 landing after the hook) then posts nothing. Once the player has sent, the condition is false and sceneBreak keeps the old guard (`breakAt === lastSelfInjectionMessageId`) unchanged. Dropped, not deferred, as afterSpeak.
- Not covered: an opening whose newest message is not self-injected (ST card greetings only), and a Restart inside a chat the player already spoke in; both keep the old behaviour.
- New tests in `runtime/hookSwipe.review.test.ts` (3): break at the opening line with the hook newest posts nothing; after a player send the same break posts its line; after a player send a break still posts while the newest message is an afterSpeak line. Without the fix the first fails (stash of `effectsApplier.ts`), the other two pass both ways.
- `npm run gates:quick`: green in 190.9 s (typecheck, typecheck:test, lint changed, jest related, replay --cached 32 of 32 killed).
- `npm run gates` (no `--resume`, Storybook included): **all green in 395.9 s**: build, typecheck, typecheck:test, debug:typecheck, lint, test (921 suites, 10672 passed, 1 skipped), test:replay (32 of 32 killed), test:debug, test:plugin, test:release, test-storybook:ci (167 suites, 1009 tests).
- Main bundle `dist/index.js` 1,254,349 B (budget 1,300,000 B).
- **Live gate: NOT run** (no lanes/GPU for this task). Owed: campaign opens (4+, fresh chat, no swipe), wait for the opening re-read and scene summary (scheduler idle + 45 s quiet), 0 scripted lines before the first send, ideally one open where the read of message 0 flags a break; then first sends: a later scene break still posts its sceneBreak line by its roll and cooldown.

#### Live gate, opening sceneBreak hold (2026-10-27)

- Branch `v3.0-scenebreak-hold` (worktree `C:\dev\so-sbhold`, HEAD `4e4b58d7`: hook swipe identity, plan 24 headroom, D10 wake, this hold), built there; served to model lane 34 in candidate mode (CDP route holder answering `/third-party/story-orchestrator/dist/**` from the worktree `dist/`); in-page `dist/index.js` sha256 `3c43ed0f66ec` = worktree manifest, 1,254,349 B, 0 chunk 404s. Nothing staged into ST, lane 0 untouched. Lane 34 `adolion-fresh.mts seed 34` (campaign pin `c5723c5`, 9 stories, 0 problems, 0 drift), restarted `--allow-local`; local controller Artemis 31B v1.1, thinking on, `max_context` 32768; images and sprites off.
- Instrumentation: a page wrapper on `effects.fireActiveReplies` recorded each afterSpeak/sceneBreak call (`breakAt`, `lastSelfInjectionMessageId`, last message id, player spoke, lines posted). Wait after each step = scheduler idle + 45 s quiet (20 s on later turns).
- Opens (fresh chat, identity kept, no swipe), 12 opens over 8 stories (the 9th, the sequel, not opened); story A (the one that hit the defect before) opened 5 times:
  - Scripted lead/afterSpeak/sceneBreak lines before the first send: **0 of 12** (every chat = opening line + hook, `lastSelfInjectionMessageId` on the hook).
  - Original trigger (read of message 0 flags a break, scene summary at 0 lands after the hook, sceneBreak called with `breakAt` 0, self 1, last 1, player not spoken): **6 of 12** (story A 4 of 5, two other stories 1 each). Each call posted 0. A fifth story-A open flagged the break but ran no summary, so no call.
  - Counterfactual: only story A (and one other story not hit) authors a sceneBreak reply on its opening checkpoint (p 0.5). Recomputing the seeded draw (`unitDraw([chat, story, boundary, key])`, checked against the live roll below: 0.244 at boundary 8 matches) gives draws at boundary 2 of 0.07, 0.40 and 0.006 for three of the four story-A hits (also under 0.5 at boundaries 1 and 3), so the old guard (`breakAt === lastSelfInjectionMessageId` only) would have posted a line in those 3; the fourth drew 0.725 (no line either way). No roll was journaled for any opening call, i.e. the hold returned before the roll.
- Later scene break (story A, continuing the chat of one held open): player turns 1-5 one reply each, no break. Turn 6: the read flagged a time-skip break at message 12, scene summary 0..13, sceneBreak called with `breakAt` 13, player spoken, **posted 1 narrator line** (message 14; journal: fired by its roll, 0.244 against 0.5). sceneBreak still posts after the first send.
- Hook swipe regression, 2 stories (story A and one other, both hit the opening trigger first): swipe of the hook then wait: **0 lines before the first send, 2/2**; `lastSelfInjectionMessageId` stays on the hook; post-swipe re-read ran 2/2 (on the second it flagged another break: sceneBreak called with `breakAt` 1, held, 0 posted). First player turn on the second: one reply, normal chain row.
- Page: 0 page errors; console errors only 404s for stripped portrait images (adolion-fresh strips sprite dirs, sprites off).
- Cleanup: `so-run-header diff --served-identity` against the pre-run capture differs only in the 14 owned chats (`inventory.groupChats`) and the page's open chat/group/story (baseline had none open). Holder stopped, lane 34 stopped. Controller left running as found.
- Evidence: `C:/dev/so-lanes/34/debug/sbhold/` (`campaign/o*-open.json`, `t*-turn.json`, `w*-{open,swipe,turn}.json`, `opens*.out`, `turns.out`, `swipes.out`, `counterfactual.js`, `instrument.js`, `probe.js`, `hold.log`, `header-*`), run dirs `C:/dev/so-lanes/34/debug/runs/2026-10-27T13-*`. Not archived to so-sessions.
- Verdict: **opening sceneBreak hold green live** (0/12 opens posted, 6 trigger hits held, 3 of them would have posted under the old guard; later break posted; hook swipe 2/2).
## Stage 3 (branch `v3.0-talk-s3`, worktree `C:\dev\so-talk3`, from master `2bb4bf8f`), not merged

Three items from "Still open" above. Dev only: no GPU, lanes or staging.

### What was built

1. **NPC `llm` replies start through the guarded voice starter** (`runtime/npcVoice.ts` `startNpcVoice`, `runtime/effectSteps.ts` `fireReply`, `stHost/generation.ts` `startGroupVoiceAt`).
   - Was a bare `/trigger await=true <position>`. ST's `/trigger` polls up to 10 s for `!is_send_press && !is_group_generating`, then clears the player's input box and calls `Generate` (`slash-commands.js:4987-5013`), so an `afterSpeak` reply that fired while a chain voice was rendering raced the chain's next `startVoice` into the same gap, and could wipe a draft the player was typing.
   - Now: wait (poll 100 ms, up to `NPC_VOICE_WAIT_MS` 10 s, the same bound as `/trigger`) while the host is generating **or a talk chain is pending** (`voiceChainPending`, i.e. `TalkController.chainPending()`: a chain's next voice is being decided or written); then refuse if the chat moved (run lapsed or chat id changed), refuse if a player line arrived during the wait ("the player spoke first"); then `startVoice` (refuses while busy or while the input box holds a draft, locks send, confirms the wrapper opened) with `findGroupMemberId(String(position))`, so the exact-position lookup of K10 (a member named "2") is kept.
   - A reply that does not start returns `couldNot`: the existing path journals "X's reply was not triggered", settles its reservation as unrendered and releases its fire count, so it can fire on a later turn. One-shot direction (armed before, released in `finally`), budget reservation, cued lines, stream guard and rollback are unchanged.
   - Lead decision: the chain owns the floor. An `afterSpeak` reply that waits out a running multi-voice chain (more than 10 s on the local model) is refused and retried at a later `afterSpeak`, never squeezed between two chain voices. Its reservation still holds a budget slot while it waits, so the chain may stop on the budget first; that is the budget arbitrating between the two, as designed in stage 2.
2. **Lead consecutive-message cap** `checkpoints[].talk_control.lead_max_consecutive` (1-8, `engine/talkSchema.ts` `TALK_LEAD_RUN_CAP`).
   - Profile defaults (`talk/policy.ts` `TALK_PROFILE_SHAPES.leadMax`): opening 2, conversation 1, decision 2, action 3, aftermath 2. No profile and no field = no cap (today's behaviour).
   - Counted from the chat at decision time (`runtime/talkPacing.ts` `leadRun`): the trailing run of the lead's character lines since the beat was entered; player and system lines are skipped, any other member's line ends the run; story-posted lead lines count. No stored counter, so a swipe, edit or delete changes the count exactly as replaying those messages would.
   - Enforced by turn-taking only (`TalkPacing.capLead`, called from `TalkController.candidates` for the first decision, chain decisions and plan contexts): while capped the lead is not a candidate, so the judge, director, mention and rules all pick someone else and the judge's lead hint drops. Never cuts tokens. Not applied to a scripted chain, and never when the lead is the only candidate.
   - Authoring: validation (`validate/talkPacing.ts`, game-layer key), diagnostics `talk-lead-cap-idle` (warning: no lead, or nobody but the lead; a profile cap on a beat with no lead stays quiet) and `talk-lead-cap-scripted` (info), Studio field "Lead lines in a row (at most)" (`TalkPacingFields`, placeholder from the profile), effective-policy line ("the lead speaks at most N times in a row"), Storybook `Studio/TalkControlEditor` CapsTheLeadsRun, wizard parser (`copilot/parseFields.ts` via `readTalkPacing`), guide `talk-pacing` (field, profile lines, If wrong) + compact twin, `npm run docs:guide`.
3. **Every chain records why it ended** (`runtime/chainEnds.ts`, `extras.chainEnds`, cap 200).
   - Row: message id and revision at the end, checkpoint, voices spoken, reason: `yield` (question to the player, address/reaction/`ask_player` hand-over), `judge` / `director` (hand-back, also at the first voice), `rules` (no fresh member), `cap`, `budget`, `transition`, `script`, `player`, `stopped`, `interrupted` (swipe/continue/quiet wrapper, or the run lapsed), `refused` (the next voice could not start), `off`.
   - Recorded once per chain from `TalkController.endChain(reason)` (`runtime/talkChainReads.ts` `recordEnd`), only for the chat the chain started in. A first decision of silence/hand-back now ends its chain at once (was left open until the next send).
   - Rollback: `rewindChainEnds` in `rollback.ts` quarantine (same rules as `rewindSpeech`: delete drops and shifts, swipe/edit keep the row on that message, an eventless change drops at/after). Sanitized on load; fresh on restart.
   - `so-talk-metrics.mts` prints `chainEnds` per chat and overall (`chains`, `byReason`, `meanVoices`), read from the chat file header like the speech record.
- Size: `talkControl.ts` 594 effective lines (file budget 600; the chain-read helpers moved to `talkChainReads.ts`); main bundle 1,297,686 B (budget 1,300,000 B; was 1,294,997 B).
- Campaign: no change. The cap rides profiles, which the campaign has not adopted (stage 2 note); the NPC starter and chain-end record need no authoring.

### Lead decisions (state them to the owner)

- `lead_max_consecutive` counts across player turns (player lines do not break the run). Otherwise `no_repeat` already gives one lead line per chain and the cap would do nothing; the problem it answers is the narrator answering every player message.
- A capped lead is not picked as the first voice even when the player names it (the run resets once another member speaks, so a chain voice after that may be the lead); the lead stays eligible only when nobody else can speak.
- `decision` 2 and `action` 3 were not in the brief (brief: conversation 1, opening/aftermath 2); chosen so a lead-first beat still lets the lead resolve consecutive actions.

### Live check owed (lane, real model)

- Race: a beat with a director chain (max 3) and an `afterSpeak` `llm` line: across 10 player turns, no two generations overlap (one `GROUP_WRAPPER_STARTED` open at a time), the NPC line never lands between two chain voices, a refused start is journaled and fires on a later turn; type in the input box during a chain: the NPC line does not start and the draft survives.
- Opening hook regression: hook order and one-shot direction (the hook now starts through `startVoice`; the player's input box must be empty, as it is on a fresh chat).
- `conversation` beat, 10 player turns, 4-member toy group: no two consecutive lead lines (`so-talk-metrics` lead runs; chain-end distribution printed), budget still 100%, every member within 4 player turns; swipe and delete a party line between two lead lines and check the next pick matches.
- `so-talk-metrics` on the stage 2 re-check chats: `chainEnds.byReason` matches the journal's hand-backs.

### Gate record, stage 3

Date 2026-10-27, branch `v3.0-talk-s3` from master `2bb4bf8f`.

- `npm run gates:quick`: red first (lint max-len in `studio/talkDiagnostics.ts`; jest: nine suites still mocked `/trigger await=true` for NPC llm replies, the compact `talk-pacing` topic over 800 chars, `talkControl.ts` 618 effective lines over the 600 file budget, so the chain reads moved to `talkChainReads.ts`), then green twice (typecheck, typecheck:test, lint changed, jest related, defect replay `--cached`).
- `npm run gates` run 1 (no `--resume`): RED, two code points: `ownership.guard` (`npcSpeak.ts#speakGenerated` now checks a token, so its census row is `checked`, not `local`) and Storybook `CapsTheLeadsRun` (the query `/in a row/` matched the field label). Both fixed.
- `npm run gates` run 2 (no `--resume`): RED at `test:plugin` only: `server-plugin/story-orchestrator-gpu/broker/comfyReclaim.test.mjs` "a reserve miss first asks the idle owned ComfyUI…" (`freeMiB` 900 vs 1300). Untouched by this branch; 3 of 3 standalone reruns pass. Load flake.
- `npm run gates` run 3 (no `--resume`, Storybook included): **all green in 275.1 s**. jest 914 suites passed (1 skipped), 10605 tests passed (1 skipped); test:replay ok; test:debug 1575/1575; test:plugin and test:release ok; test-storybook:ci 166 suites, 1007 tests. Main bundle 1,297,686 B (budget 1,300,000 B). Docs-only edits after the run (this record).
- New tests, each failing without its change (checked by reverting the source change): `runtime/effectsApplier.test.ts` "stage 3" (waits for a pending chain, never a bare `/trigger`; a player line during the wait refuses and gives the allowance back: 2 fail on the old `effectSteps.ts`), `runtime/talkPacing.review.test.ts` "stage 3: the lead's consecutive-message cap" (3 of 5 fail with the cap forced off; the 2 that pass are the no-cap and scripted/alone controls) and "stage 3: every chain records why it ended" (2 fail without the record), plus `runtime/npcVoice.test.ts`, `runtime/chainEnds.test.ts`, `studio/talkDiagnostics.test.ts`, additions to `talk/policy.test.ts`, `engine/validate/talkPacing.test.ts`, `copilot/parseFieldsTalk.test.ts`, `studio/diagnostics.test.ts` (every code once), `scripts/debug/lib/talkMetrics.test.mts`. Test mocks moved from `/trigger` to `startGroupVoiceAt` in `npcRepliesOwnership`, `npcReplyRefusal`, `openingHook`, `npcTriggerStop`, `npcLateLanding`, `npcStreamLanding`, `effectsOwnership`, `chatSwitchHold.recorded`, `runtimeManager.test.ts`; two stage 2 spotlight controls pin `lead_max_consecutive: 8` (the conversation profile now caps the lead at 1).
- Findings: `test/findings/ownership-sites.json` (`speakGenerated` -> `checked`).
- Guide: `story-guide.md` (`lead_max_consecutive`, profile lines, two diagnostics, chain-end reasons, the NPC starter replacing the race limit), compact `guideTopicsTalk.ts`, `npm run docs:guide`. No settings changed, so no `docs:settings`.
- **Live gate: NOT run** (dev only; lanes and GPU in use). Owed: "Live check owed" above. Not green until it runs.
- Merge note: master moved to `21a037f9` (visual bridge, main bundle 1,298,651 B) after this branch was cut. This branch adds about 2.7 KB to the main bundle, so the merge would exceed 1,300,000 B; it needs a lazy split (the chain-end record and the NPC starter are the main-entry additions) before merging, never a budget raise.

### Gate record, stage 3 integration

Date 2026-10-27, branch `v3.0-talk-s3-int` (worktree `C:\dev\so-s3int`) from `v3.0-scenebreak-hold` `9ee19cf0`, merge of `v3.0-talk-s3` `cda2e1b4` = `8b40ba2a`.

- Merge: one conflict, this file (both sides' sections kept, gate records unchanged). Auto-merged `runtime/types.ts` (adds `chainEnds?` beside `speech?`) and `test/findings/ownership-sites.json` (`npcSpeak.ts#speakGenerated` -> `checked`, valid JSON) read sane. No code change after the merge.
- `npm run gates:quick`: green in 257.4 s (typecheck, typecheck:test, lint changed, jest related, replay `--cached` 32 of 32 killed).
- `npm run gates` (no `--resume`, Storybook included): **all green in 442.9 s, first run**: build, typecheck, typecheck:test, debug:typecheck, lint, test, test:replay, test:debug, test:plugin, test:release, test-storybook:ci.
- Main bundle `dist/index.js` 1,257,038 B (budget 1,300,000 B; base 1,254,349 B, +2,689 B). The stage 3 merge note (over budget on `21a037f9`) no longer applies on this base.

#### Live gate, stage 3 integration (2026-10-27)

- Served to model lane 34 in candidate mode (CDP route holder answering `/third-party/story-orchestrator/dist/**` from the worktree `dist/`); in-page `dist/index.js` sha256 `a5832d056d3e` = worktree manifest, 1,257,038 B, 0 chunk 404s, unchanged through the run (the gates rebuild wrote identical bytes). Nothing staged into ST, lane 0 untouched. Lane 34 `adolion-fresh.mts seed 34` (campaign pin `c5723c5`, 0 problems, 0 drift), restarted `--allow-local --headed`; local controller Artemis 31B v1.1, thinking on; images and sprites off. Wait after each step = scheduler idle + 45 s quiet (opens) / 20 s (turns).
- Opening regression, 5 campaign stories, fresh chat each, identity kept: lines before the first send **0 of 5** (every chat = opening line + hook); the hook started through the guarded starter 5/5 (`Generate normal` with `force_chid`, one wrapper); sceneBreak called at the opening and held 3/5 (`breakAt` 0, self 1, player not spoken); at most one group wrapper open at a time.
- Hook swipe (one story): **0 lines** before the first send, `lastSelfInjectionMessageId` kept on the hook, afterSpeak called and held. First player turn after it: one reply, chain end `judge` 1 voice.
- Race (neutral story, toy group of 4, director chain max 3, an `afterSpeak` `llm` line for one member, `once_per player_turn`, cooldown 0; living and branching off for the chat), 10 player turns:
  - Overlapping generations: **0** (max open group wrappers 1).
  - NPC line between two chain voices: **0** (3 sends with a 2-3 voice chain; the NPC line always landed after the chain's last voice).
  - Refused starts: 5, each journaled "reply was not triggered: another voice held the floor"; the line fired later in the same player turn (after the chain) or on a later turn; one held by the speech budget (4 of 4 voices).
  - Chain ends recorded: 9 (`director` 7, `yield` 1, `cap` 1; turn 10 crossed a transition into a beat with no talk control, so no chain); budget 10/10.
- Draft during a chain (same story, fresh chat), typing into the input box right after the first voice landed: draft kept **4/4**, no line started after it; the NPC line refused "the player is typing" 3/3 when it was due. See defect 1 for a fifth run typed earlier.
- Lead cap (`conversation` profile, cap 1, toy group of 4), 10 player turns: lead lines 2 (never two in a row, counted across player lines); voices per send 1 x9 then 3 (budget 3, 10/10); each party member within 4 player turns; chain ends 10 (`director` 5, `yield` 4, `cap` 1, mean 1.2 voices). `so-talk-metrics` agrees (`chainEnds.byReason` printed per chat and overall). Lead words 153 vs target 120 (1 of 2 within, informational).
  - Swipe of the last chain voice: chain-end row kept on that message, no new voice, 0 extra lines.
  - Delete of the three party lines after the last lead line (so the lead run is 1): the row at the deleted message dropped; the next send named the lead and a party member answered (the capped lead was not picked), as replaying the shortened chat gives.
- Not run: the `so-talk-metrics` check on the stage 2 re-check chats (they predate the chain-end record); hook direction payload (not captured).
- Page: 0 page errors over 150 captured command windows; console errors only 404s for stripped portrait images.
- Cleanup: `so-run-header diff --served-identity` (through `st-lanes run 34`) against the pre-run capture differs only in the 8 owned chats and the page's open chat/group/story (baseline had none open); both neutral stories removed from the lane library. Holder stopped, lane 34 stopped, controller left running as found.
- Defects and incidents:
  1. Pre-existing, not stage 3: a draft typed while the first voice is still streaming inside the player's own group wrapper is posted as a player line (1 of 5 draft runs). ST runs `Generate('normal')` per activated member (`group-chats.js` wrapper loop), and each call reads `#send_textarea` before our interceptor aborts the non-chosen member, so the second activated member's call sent the draft. The guarded starter and chain voices are not involved (they refuse while a draft is present). Plain ST has the same hazard with two activated members. Not fixed here.
  2. Harness: under full-gates CPU load one `st-lanes run` attach timed out and `lib/connection.mts` `attachToSession` deleted the lane's `session.json`; every later run launched its own headless browser at the lane URL (no route, no chat), so three race sends went nowhere until the session file was rewritten. Those turns were discarded and rerun (race evidence = the rerun). Separately, one `so-run-header diff` run without `st-lanes run` captured the default ST URL (the owner's port 8000) read-only, twice; the owner's `settings.json` mtime is unchanged (09:09Z).
- Evidence: `C:/dev/so-lanes/34/debug/s3int/` (`campaign/o*-open.json`, `w1-swipe.json`, `t1-turn.json`, `r*-turn.json`, `c*-turn.json`, `cs1-swipe.json`, `cd1-probe.json`, `draft*.log`, `metrics-{race,conv}.json`, `race.story.json`, `conversation.story.json`, `instrument.js`, `probe.js`, `hold.log`, `header-diff.txt`, `gates-run1.log`), run headers `C:/dev/so-lanes/34/debug/run-header-s3int-{pre,post}.json`, run dirs `C:/dev/so-lanes/34/debug/runs/2026-10-27T1[45]-*`. Not archived to so-sessions.
- Verdict: **stage 3 integration green live** (NPC llm lines through the guarded starter: 0 overlaps, never between chain voices, refusals journaled and retried, drafts respected; lead cap held over 10 turns and after swipe/delete; chain ends recorded; opening hold 0/5 and hook swipe 0 lines). Defect 1 is pre-existing and open.

#### Live gate, campaign talk stage 2 adoption (2026-10-27)

- Extension `v3.0-campaign-talk-s2` `71561e98` (worktree `C:\dev\so-camps2`), built there; served to model lane 34 by the CDP route holder from the worktree `dist/`: in-page `dist/index.js` sha256 `a5832d056d3e` = manifest, 1,257,038 B, 0 chunk 404s, unchanged through the run. Nothing staged into ST, lane 0 untouched. Lane 34 `adolion-fresh.mts seed 34` at campaign pin `e631194` (branch `talk-s2-adopt`; the seeder exports the commit, the branch name is not read): the first run timed out in the page reload step, `--resume` finished it, 0 problems, drift = the pin and the 9 library hashes only. Restarted `--allow-local --headed`; local controller Artemis 31B v1.1, thinking on, `max_context` 32768; images and sprites off. Another agent used lane 35 on the same GPU.
- Beats reached with `/cp activate` (Author view wrapper). Probe after each step = scheduler idle + 20 s quiet. Five new chats, two campaign stories.
- 1. Conversation beat (lead = narrator, 7 speakers, no `spotlight.members`), 10 player turns, 5 actions + 5 talk lines:
  - Budget 3: no send over 3 voices (`so-talk-metrics --budget 3`: 13/13 rounds over the whole chat; voices per send in the beat 1-3).
  - Companions: the three enabled party members each spoke within 4 player turns (longest quiet 3); the fourth companion is disabled in the group at that point of the story.
  - Address beats: 2, one from a companion, one from a non-party scene member (`by` defaults to `relevant_member`). **Partial.**
  - World response to actions: **4 of 5** action turns got a result (3 from the narrator, 1 from a companion who took the first voice by spotlight); 1 got none (its only voice was an empty thought-only reply, defect 2). Spotlight took the first voice on 3 of 10 sends; the narrator spoke first on 4.
  - Spotlight picks 13: 7 companions, 6 non-party scene members (defect 4). Lead lines within 1.25 x 120 words: 6 of 7. Empty replies 3 of 30 lines.
- 2. Decision beat, 3 turns: voices 1, 1, 2 (chain end `cap` at 2), lead first where the player named nobody, 0 address rows. **Pass.**
- 3. Crowd beats with spotlight and reaction limited to companions (a 9-speaker conversation set piece, 8 turns; an 11-speaker action set piece, 6 turns; living and branching off for the chat): spotlight picks **6 of 6 companions**; address 2 of 2 companions; reaction 0 (no consequential event in either beat, not exercised). **Pass for spotlight.**
- 4. Four-voice set piece (budget 4; effective policy read back `voices 4, attempts 5`): one send of 6 reached **4 voices** (chain end `cap` 4) on the action set piece; the conversation set piece peaked at 3 (hand-backs, never a budget end). **Pass.**
- 5. Eavesdrop beat (`address_player: false`, scripted chain of 2), 5 turns: 10 lines, **0 address rows, 0 quoted questions**, nobody turned to the player. **Pass.**
- 6. Twice-firing ambient sceneBreak line (`once_per: entry`, max 2, cooldown 3): fired on player turns **1 and 8** of the visit (2 fires, 7 turns apart). **Pass.**
- 7. Opener + hook on a new chat: **5 of 5** chats posted exactly the opener (fired key `<cp>:opening` = 1) and the hook (1), 2 messages before the first send.
- 8. Reload (`st-session reload`, chat reopened): both fired counts unchanged, no repost (2 messages). **Pass, 1 of 1.**
- Defects and incidents:
  1. **Living way-ins have no talk control.** On the first chat the living director branched into a `liv_` checkpoint one turn into the set piece, twice (the folded op persists after living is switched off). That checkpoint has no `talk_control` and the story sets no `talk_defaults`, so nothing budgets it: 14 sends there took 2-7 voices (one send 7, two sends 5). Fix candidates: a `liv_` checkpoint inherits the source beat's talk policy, or the campaign sets `talk_defaults` on every story (now 2 of 9).
  2. **Thought-only replies**: 3 of 30 lines in check 1, 3 per arm in the rating pair. Two of the check 1 empties have one swipe, i.e. were not retried once as `emptyReply.ts` promises (reasoning 2-5 k chars each). Model side plus a possible retry gap; open.
  3. **Speech row settles to the wrong message on an entry turn**: when an `onEnter` line posts in the same send as the first chain voice, the chain row got `messageId` null (2) or the entry line's id (1), 3 of 3 such turns. Budget counting reads the chat, so no over-budget send followed; the record is wrong. Open.
  4. **Campaign: conversation beats without `spotlight.members` spotlight non-party scene members** (6 of 13 picks; 3 of 9 in the rating arm) and get addressed by them (2 of 3). The adoption limited spotlight/reaction only on the 28 crowd beats. Raise with the campaign pass.
  5. Harness (known, recurred once): an attach timeout deleted the lane's `session.json`; the next 16 `st-actions send` runs launched their own headless page and still reported `replied: true, newMessages: 3` while nothing was posted (chat files unchanged). Those turns were discarded and rerun after restoring the session file; the run's driver restores it before every call.
- Cleanup: the lane library copy of the story restored (hash back to the seed inventory). `so-run-header diff --served-identity --owned <5 chats>` (through `st-lanes run 34`) differs only in the 5 owned chats and the page's open chat/group/story (baseline had none open). Holder stopped, lane 34 stopped and **left seeded at campaign `e631194`**. Controller left running as found.
- Evidence: `C:/dev/so-lanes/34/debug/camps2/` (`campaign/*-{open,cp,turn,probe,reload}.json`, per-beat `*.out`, `metrics-conv-full.txt`, `hold.log`, `header-diff.txt`, `seed*.log`), run header `C:/dev/so-lanes/34/debug/run-header-camps2-pre.json`. Not archived to so-sessions.
- Verdict: **adoption checks 2-8 green live; check 1 partial** (budget and companion presence hold; one action of five unanswered because of an empty reply; address and spotlight reach non-party members on beats without a member list). Defect 1 (living way-ins unbudgeted) is the largest pacing risk found.

#### Blind pacing rating pair (2026-10-27)

- Arms on lane 34, same story, same two beats, same 8 scripted player lines per beat, living and branching off per chat, each arm one new chat (opening, `/cp` to beat 1, 8 turns, `/cp` to beat 2, 8 turns):
  - ON: the story as pinned (`e631194`): beat 1 `conversation`, beat 2 `action`.
  - OFF: a copy with `talk_defaults` and `talk_control` `profile`, `budget`, `lead_words`, `spotlight`, `address_player`, `reaction`, `lead_max_consecutive` stripped (35 keys), imported over the library copy for the OFF chat only (the ON chat kept its pinned copy, read back `action`), then the original re-imported. Reply ids and `once_per` kept, so OFF is close to, not identical with, pin `c5723c5`.
- Objective (from the chat files): voices per send ON 2.4 / 1.9, OFF 2.5 / 2.25 (beat 1 / beat 2); narrator lines ON 4 / 6, OFF 8 / 7; mean narrator words ON 61 / 130, OFF 97 / 148; empty replies ON 3, OFF 3.
- Floors, declared before scoring (`rating/floors.json`, 16:13Z): F1 ON overall mean >= OFF overall mean; F2 ON responsiveness median >= 4.
- Rater: `codex exec -m gpt-6.1-sol -s read-only`, transcripts blinded A/B per beat (key file apart), rubric pacing, responsiveness, companions, space, overall (1-5) + preference.
  - Pass 1 (the scored one): ON overall 2, 2 (mean 2.0), OFF 3, 4 (mean 3.5); ON responsiveness 3, 3 (median 3), OFF 4, 4. Preference **OFF 2 of 2**.
  - Pass 2, labels swapped (position check, not scored): ON overall 3, 2; OFF 3, 3; ON responsiveness 3, 2; preference OFF 2 of 2.
  - Rater reasons, paraphrased: in beat 1 the ON arm drifted to non-party characters and unasked plans while OFF followed the player's actions; in beat 2 the ON arm's first voices missed the scene before the fight got going.
- **F1 FAIL, F2 FAIL.** Recorded as measured, floors not retuned. n = 2 beats, one rater, one chat per arm: weak evidence, but every judgement went the same way. Likely contributors seen in the run: spotlight pulling non-party scene members into conversation beats (defect 4 above), the narrator ceding the first voice on player actions; empty replies were equal in both arms. Switching profiles off is the owner's call; a rerun after defect 4 is the next measurement.
- Evidence (private): `C:/dev/so-lanes/34/debug/camps2/rating/` (`floors.json`, `blind/b*-{A,B}.txt`, `KEY.jsonl`, `prompt*.txt`, `rating-out*.txt`, the OFF story copy, `arm-*.out`), chats in lane 34's group chats folder.

### Gate record, keep-last question post-pass

Date 2026-10-27, branch `v3.0-oneq-keeplast` (worktree `C:\dev\so-keeplast`) from master `dd84caf7`. Not merged, not staged, not installed.

- Why (offline experiment on branch `v3.0-oneq-blind`, same 29 opening hooks, 8 stories, rater Sol, blind): baseline single question 14 of 29 (48%); first-question trim 23 of 29, paired overall 3.54 vs 4.08 (rejected); keep-last variant 27 of 29 (93%, the 2 misses ask no question), paired overall 4.38 vs 3.92, preference 10-2-1, cut off 0 of 13 paired and 0 of 29 full; 13 changed, 16 untouched, 0 rejected, mean 9.2 words removed. Caveats: one rater, 13 changed hooks, one story 11 of 29.
- Pure port `src/pacing/keepLastQuestion.ts` (`keepLastQuestion`, `countQuestions`): drops every question sentence but the last; a quote or `*…*` span left holding only a dropped question goes with it, and a dialogue tag right after a dropped quote; a follow-up fragment of 4 words or fewer joins its question with an em dash; keeps the original (rejected) when the result is empty, under 6 words, has unbalanced quotes/asterisks or not exactly one question. Idempotent.
- Hook point: `runtime/keepLastQuestionPass.ts` (injected deps) on `MESSAGE_RECEIVED`, the same seam and write as the thought-leak repair (`rewriteReplyText`, reasoning passed through unchanged), lazy `keepLastQuestionLive.ts` started from `wiring/talk.ts` `startKeepLastQuestion`. Which reply: `PacingCoordinator` marks the drafted member's generation when the one-shot direction it renders asks the player (`asksPlayerDirection`: `ask_player` npc replies, so the opening hook and chapter hooks, plus `address_player` beats and swiped cued lines, which carry the same direction); `takeAskingPlayer(speaker)` consumes the mark once per armed direction, a later draft drops an untaken mark, withheld (quiet/impersonate) runs set none. So once per generated revision, before the boundary reads it.
- Provenance: no per-message metadata (the thought-leak repair records none either); journal lines via `noteRecap` with counts only (trimmed: questions and words removed; kept: why).
- Setting `talk.keepLastQuestion` (install-wide, default on), checkbox `#so-keep-last-question` in Characters › Speaker direction, copy in `settingsCopy.ts`, feature `keep-last-question` (guide topic `npc-replies`), session baseline, plan 24 matrix row. Guide: `npc-replies` and `address_player` paragraphs, compact twin; `npm run docs:guide`, `npm run docs:settings`.
- Tests (invented text only, no campaign text): `pacing/keepLastQuestion.test.ts` (13: each rule, rejection paths, blank lines, idempotence), `runtime/keepLastQuestionPass.test.ts` (13: pass writes visible text only, switch off, player/unnamed rows, untouched, rejection journal, refused write; coordinator mark by name/id/tail, no mark without ask or draft, draft clears, withheld, swipe re-arm; setting default and sanitize).
- `npm run gates:quick`: green in 80.7 s.
- `npm run gates` (no `--resume`, Storybook included): first run RED at test:release (new feature had no plan 24 matrix row); row added; second run **all green in 282.2 s**: build, typecheck, typecheck:test, debug:typecheck, lint, test (923 suites, 10698 passed, 1 skipped), test:replay (32 of 32 killed), test:debug (1578), test:plugin, test:release (128 pass, 14 skipped), test-storybook:ci (167 suites, 1009 tests).
- Main bundle `dist/index.js` 1,255,088 B (budget 1,300,000 B; +739 B over master).
- **Live gate: NOT run** (no lanes/GPU/owner ST for this task). Owed: fresh opens with a real model on a campaign lane, hooks with 2+ questions trimmed to the last (visible text only, `extra.reasoning` unchanged, swipes[] updated), the extraction read and `asksPlayer` yield seeing the trimmed text, a hook swipe trimmed again, the switch off leaving hooks as generated, and no trim on non-asking replies.

### Live gate, keep-last question

Date 2026-10-27, branch `v3.0-oneq-keeplast` (worktree `C:\dev\so-keeplast`). Not merged, not staged, not installed.

- Merge of master `f8b56971` (talk stage 3) into the branch: commit `4227ca2e`. Conflicts: guide `npc-replies` paragraph (both sides kept: stage 3's guarded-starter text plus the keep-last sentences), this plan (both sections kept), generated guide (regenerated with `npm run docs:guide`, `npm run docs:settings`); `wiring/talk.ts` auto-merged clean (stage 3's `startGroupVoice`/`recordChainEnd` next to `startKeepLastQuestion`). `npm run gates:quick` green in 104.0 s; `npm run gates` (no `--resume`) first run RED at test-storybook:ci (one axe `color-contrast` hit in `Studio/SpriteBuilder › HeadBoxWaitsForItsReference`, a story this branch does not touch), second run **all green in 463.4 s** (test 926 suites / 10721 passed, replay 32 of 32 killed, test:debug 1579, test-storybook 167 suites / 1010). Main bundle 1,257,777 B.
- Served to model lane 35 in candidate mode (CDP route holder answering `/third-party/story-orchestrator/dist/**` from the worktree `dist/`, 0 chunk 404s over the run). Lane 35 `adolion-fresh.mts seed 35` (campaign pin `c5723c5`, 9 stories, 0 problems), restarted `--allow-local --headed`; local controller Artemis 31B v1.1, thinking on, `max_context` 32768; images and sprites off. Lane 34 ran another agent's work on the same model at the same time. Lane 0 and the owner's ST untouched.
- Instrument: a first-placed `MESSAGE_RECEIVED` listener records each reply as generated; a wrap of `takeAskingPlayer` records which replies were marked; the probe compares generated, posted, in-memory, `swipes[swipe_id]` and the saved chat file (`/api/chats/group/get`), plus the newest extraction audits and the journal. Wait = scheduler idle + 45 s quiet.
- Run A, build `4227ca2e` (in-page `index.js` sha256 `7c37a439a6e5` = worktree manifest): 12 fresh opens over all 8 hook groups (4 repeated). 9 hooks with text; 3 hooks came back thought-only twice (empty-reply path: swiped once, second empty kept; pre-existing, 1 of 17 opens in the earlier plan 19 runs). Generated with 2+ questions: 4 of 9; each posted with exactly one question, the last one kept; 3 of 4 kept every other sentence. **Defect 1**: the 4th dropped a starred dialogue-tag span whole, so a narration sentence after the tag in the same `*…*` went too. Hook swipes: 3 of 3 carried the ask direction (the thinking quotes it) but were **not marked**, posted with 2, 2 and 4 questions. **Defect 2** (trace of the pacing coordinator): on a swipe the mark was set, then the swipe's `reapply` intent (`clearPrivateInjection` + `onMemberDrafted`, an earlier `MESSAGE_RECEIVED` listener) re-drafted the same member and `draftGuidance` dropped the mark before the pass ran. Offline replay of the swipes showed **defect 3**: an unstarred tag (`she asks, …`) after a dropped quote stayed behind, and a question trimmed off the end of a quote left a space before the closing quote.
- Fixes, commit `69045568`: `draftGuidance` keeps the mark when the same member is drafted again (test: a same-member re-draft keeps it, taken once); the tag rule drops only the tag sentence and reopens the `*` span when it goes on, drops an unstarred tag sentence, and `tidy` removes a space before a closing quote (2 tests, invented text). `afterDroppedQuote` split out to stay under the code-health branch ratchet. `npm run gates:quick` green in 82.9 s; `npm run gates` (no `--resume`) **all green in 313.8 s** (test 926 suites / 10724 passed, replay 32 of 32, test:debug 1579, test-storybook 167 / 1010). Main bundle 1,257,845 B (budget 1,300,000 B). Offline replay of every Run A hook on the fixed code: the 3 clean trims identical, the defect 1 hook keeps its narration, the swiped hooks trim cleanly.
- Run B, build `69045568` (in-page sha256 `3492ce38b005` = worktree manifest, page reloaded): 9 fresh opens over all 8 groups, 9 hooks with text, 0 empty. Generated with 2+ questions 3 of 9; each posted with only the last question, rest intact 3 of 3. Hook swipes: 3 of 3 marked; the 1 with 2 questions trimmed (the unstarred tag sentence went with its dropped quote, by design); after 2 more swipes `chat[1].swipes[1]` and the saved file's swipe still equal the trimmed text.
- Single-question rate of posted hooks: Run B 12 of 12 (9 opens + 3 swipes), Run A 9 of 9 text hooks on opens (its 3 unmarked swipes are defect 2). Generated single-question over all 24 text hooks/swipes with the switch on: 13 of 24 (54%). 8 trims, each 2 questions to 1, 5 to 33 words removed.
- `extra.reasoning` unchanged on 8 of 8 trims; in-memory `swipes[swipe_id]` equals the trimmed visible text 8 of 8; saved chat file equals it 8 of 8.
- Extraction: the next read's audit prompt held the trimmed hook and none of the dropped sentences, 8 of 8. Chain yield (`voiceAsksPlayer`, read at wrapper end): the last row equals the final trimmed text at `GROUP_WRAPPER_FINISHED` in 11 of 11 instrumented opens. **Defect 4 (open, not fixed)**: the `afterSpeak` fire for the hook (its `awaitsPlayer` = `lastReplyAsksPlayer`) read the hook BEFORE the pass in 3 of 3 instrumented trims (fire ~200 ms after the reply arrived, pass ~25 ms after the fire). turnBridge's `MESSAGE_RECEIVED` listener runs its boundary microtasks while ST awaits the listener list, and the keep-last listener (like the thought-leak repair on the same seam) subscribes late through a lazy import. The decision reads only the last quote or sentence, which the trim keeps, so no outcome changed here; a dropped question naming another member inside the last quote could flip it. Fix: place both repairs first in one ordered listener (thought-leak, then keep-last), e.g. a `subscribeToHostEventFirst` next to `subscribeToHostEventLast`.
- Switch off (`talk.keepLastQuestion` false, read back false): 3 opens, 2 hooks with 2 questions posted as generated, no journal line; then the key removed, read back true (default).
- Non-asking replies: 0 of 31 changed (24 entering narrator lines, 3 thought-only replies, 4 party replies over 3 player turns); `takeAskingPlayer` answered true only for hooks.
- Journal: one line per trim with counts only ("2 questions down to one, N words removed"), 8 of 8; no "kept as written" line (no rejected trim seen).
- Stage 3: 0 lines before the first send in 24 of 24 opens (opener + hook only).
- Open, seen on Run A only: when the first hook reply is thought-only, the empty reply takes the mark and the empty-reply repair swipe was not marked (3 of 3); a repair swipe that asked twice would not be trimmed.
- Quality notes: a dropped rhetorical question can leave the next line without its referent (1 of 8); two action spans can end up side by side (1 of 8). Within the rules.
- Cleanup: `so-run-header diff` (through `st-lanes run 35`) against the pre-run capture differs only in the build (the declared mid-run fix), the page's open chat/group/story (baseline had none open) and exactly the 24 owned chats; no settings, library, lorebook or wizard drift. Holder stopped, lane 35 stopped and re-seeded offline as found (`SO_LANE_OFFLINE=1 st-lanes seed 35 --fresh`: no-model, offline). Controller left running as found. `C:\dev\so-lanes\35\adolion-fresh\` (campaign export + sprite worktree) left, as on other lanes.
- Evidence (counts only): `C:/dev/so-lanes/35/debug/keeplast/` (`*.summary.json`, `*.fire.txt`, `hold.log`, `hash.js`, `header-diff.log`, `owned.txt`, `candidate-hold.mjs`), run headers `C:/dev/so-lanes/35/debug/run-header-keeplast-{pre,post}.json`, run dirs `C:/dev/so-lanes/35/debug/runs/2026-10-27T1[5-7]-*`. Hook texts and scripts (private): `C:/dev/so-lanes/reviews/keeplast-live-2026-10-27/` (`runs/*.json|log`, `instrument.js`, `probe.js`, `analyze.js`, `firetext.js`, `pacetrace.js`, `recheck.mts`). Gate logs: `C:/dev/so-lanes/reviews/gates-keeplast-merge.log`, `gates-keeplast-merge-2.log`, `gates-keeplast-fix.log`. Not archived to so-sessions.
- Verdict: **keep-last green live on the fixed build** (every marked hook and swiped hook posts one question, reasoning and stored swipe consistent, extraction and chain yield see the trimmed text, switch off honoured, non-asking replies untouched). Open: defect 4 (late listener order, no outcome change observed) and the unmarked empty-reply repair swipe.

### Defects 4 and 5

Date 2026-10-27, branch `v3.0-oneq-keeplast`, on `b7d99cf3`. Not merged, not staged, not installed. CPU only (no lane, GPU or owner ST).

- Defect 4 (late listener order): both repairs now run in one `MESSAGE_RECEIVED` listener placed first (`runtime/replyRepairs.ts` `REPLY_REPAIR_ORDER` thought-leak then keep-last, host side `replyRepairsLive.ts` through new `stHost/events.ts` `subscribeToHostEventFirst` = ST `makeFirst`, same signature as branch `v3.0-draft-guard`, re-placed on `GENERATION_STARTED`). Both modules stay lazy; whichever loads first opens the listener and the order is the list, not the load. A throwing repair does not skip the next. Test `runtime/replyRepairs.test.ts` (5: order pinned, ahead of an earlier turn listener whichever repair loads first, the turn listener reads both writes, failure isolation, detach on last remove), on an emitter with ST's `makeFirst`/sequential `emit` semantics. STAPI mocks in 6 wiring tests gained `subscribeToHostEventFirst`.
- Defect 5 (thought-only reply took the mark): `keepLastQuestionPass` returns before `takeAskingPlayer` when `visibleReplyText(mes)` is empty, so the empty-reply repair swipe keeps the mark and is trimmed. Test in `runtime/keepLastQuestionPass.test.ts` (thought-only reply writes nothing and leaves the mark; the swipe after a same-member re-draft is trimmed, mark taken once); fails without the fix.
- `npm run gates:quick` green in 103.0 s. `npm run gates` (no `--resume`, Storybook included) **all green in 337.9 s** first run (test-storybook 167 suites / 1010). Main bundle `dist/index.js` 1,258,317 B (budget 1,300,000 B).
- Live: NOT run (CPU only). Owed: a hook with a dropped question checked by `afterSpeak` after the trim, and an empty first hook whose repair swipe asks twice.
### Gate record, draft guard

Date 2026-10-27, branch `v3.0-draft-guard` (worktree `C:\dev\so-draftguard`) from master `f8b56971`. Fixes stage 3 integration defect 1.

- ST path (ST `ad29cbda6`, 1.19.0), verified in source:
  - `group-chats.js:985` reads `#send_textarea` once at wrapper start (`userInput`); `:1048` emits `GROUP_WRAPPER_STARTED`; `:1051-1064` loops the activated members: `GROUP_MEMBER_DRAFTED` (`:1060`), then `Generate('normal', { automatic_trigger: byAutoMode, ...params })`. `:1067-1070` auto-continue calls `Generate('continue')` too.
  - Every member call in `script.js` `Generate`: emits `GENERATION_STARTED` (`:4299`), runs `processCommands` on the box (`:4311`, so a slash draft would run as a command), awaits `pingServer` (`:4336`), reads and clears the box with a synthetic `input` event (`:4398-4402`), posts the text as the player's line (`:4448-4453`). Interceptors run only later (`:4564`, `extensions.js:2024-2049`), so talk control's abort of the non-chosen member comes after the post.
  - Plain ST has the same hazard with two activated members. A forced wrapper (our voice starter, `Generate('normal', { force_chid })`) reads the box at the same place, so a draft typed between the starter's draft check and `:4402` was exposed too.
- Fix: `stHost/draftHold.ts` (pure, injected box), installed by `installDraftGuard` (`stHost/generation.ts`, through `STAPI`, started in `runtime/index.ts`, disposed on stop; active while a group is open). Only the first box-reading `Generate` of a wrapper may take the box, and only when the wrapper began with text, is not automatic and not forced. Every other non-dry, box-reading call (types other than regenerate/swipe/quiet/impersonate) holds: at `GENERATION_STARTED` (placed first with ST's `makeFirst`, re-placed at each wrapper start, so it runs before `processCommands`, `willAddUserMessage` and the lore timing) the draft and caret are stashed and the box is emptied and set read-only; the draft is put back at ST's own synthetic `input` clear (`:4402`, value empty), or at the next member, wrapper end, STOP or chat change, whichever comes first. Text in the box at put-back is kept after the draft. ST unmodified. Reused the box-reading type list (`NO_BOX_READ_TYPES`, was `NO_TEXTAREA_TYPES`).
  - Known cost: keystrokes during the hold window (our hold to `:4402`: the remaining `GENERATION_STARTED` listeners, `GENERATION_AFTER_COMMANDS`, one `pingServer`) are dropped by the read-only box, not posted. Not measured live; a mobile soft keyboard reacting to `readOnly` is unverified.
- Test: `services/stHost/draftHold.test.ts` (13): a fake ST loop following the lines above. Controls without the guard post the draft, run a slash draft, post a keystroke typed during the ping and post a draft through a forced wrapper; with `hold` disabled 11 of 13 fail (the 2 that pass are the control and the inactive case). Six runtime test mocks of `STAPI` gained `installDraftGuard`.
- `npm run gates:quick`: red first (two max-len lines, the STAPI mocks, an unused type export), then green in 115.9 s.
- `npm run gates` (no `--resume`, Storybook included): **all green in 485.1 s, first run**. jest 925 suites passed (1 skipped), 10708 tests passed (1 skipped); test:debug 1579/1579; test:replay, test:plugin, test:release ok; test-storybook:ci 167 suites, 1010 tests.
- Main bundle `dist/index.js` 1,259,234 B (budget 1,300,000 B; base 1,257,038 B, +2,196 B).
- **Live gate: NOT run** (CPU only; no lanes, GPU or owner ST). Owed: on a model lane, stage 3 race story (toy group of 4, natural activation so a send activates two or more members, director chain on), at least 5 runs each of: type into the box while the first voice of the player's own send streams; type during a chained voice; type a slash draft (`/echo x`) mid-chain; press STOP mid-chain with a draft. Pass = no player line other than the sends, no command run, the draft and caret intact after the chain, 0 overlapping wrappers, chain-end rows as before. Also once each: plain send with two activated members and no draft (no regression), swipe and impersonate in the group, and at a phone viewport (`ST_DEBUG_VIEWPORT=390x844`) that the box keeps focus while held.

#### Live gate, draft guard (2026-10-27)

- Served to model lane 35 in candidate mode (CDP route holder answering `/third-party/story-orchestrator/dist/**` from this worktree's `dist/`, rebuilt at `d989066a`, identical bytes); in-page `dist/index.js` sha256 `05008b4708e4` = manifest, 1,259,234 B, 0 chunk 404s. Nothing staged into ST; lane 0 and the owner's ST untouched (every harness script ran through `st-lanes run 35`; the driver attached to CDP 9335 only and refused any page not on `127.0.0.1:8135`). Lane 35 `adolion-fresh.mts seed 35` (campaign pin `c5723c5`, 0 problems, 0 drift), started `--allow-local --headed`; local controller Artemis 31B v1.1, thinking on, `max_context` 32768; images and sprites off.
- Setup: stage 3 neutral race story (toy group of 4, natural activation, director chain max 3, `afterSpeak` `llm` line for one member), living and branching off for the chat. A scripted-chain copy of it (same checkpoint, `chain.mode: scripted`, max 3) was used for chained-voice runs, because director chains on this lane mostly ended after one voice (`rules`/`yield`; 1 two-voice director chain in 7 tries). Player lines naming two or three members, so one send activated 2-4 members (`GENERATION_STARTED` count per wrapper).
- Typing is real keystrokes (Playwright keyboard over CDP, trusted events, ~35 ms a key) into the focused box; the send itself is a programmatic click. Instrument: wrapper open count, per-`Generate` box state (read-only = held), a `MutationObserver` on the box's `readonly` attribute (hold windows, focus at start and end), capture-phase `keydown` with read-only state (= dropped key), `toastr` wrapper for `/echo` (positive control: an executed `/echo SLASHPROBECTRL` was captured).
- Draft during the first voice of the player's own send, continuous typing until the wrapper closed, 5 runs (+2 at the phone viewport below): player lines 1 per send 7/7; draft kept and box = every key typed while not held 7/7; caret at end 7/7; holds 14 (2-4 activated members per send; later members `HELD` every time); max open wrappers 1.
- Draft during a chained voice (typed while the second voice of a send streams, a forced `startVoice` wrapper), 6 runs (1 director, 5 scripted): player lines 1 per send, draft and caret intact, the chain's next voice refused (chain end `refused`, 2 voices) as before, max open wrappers 1. Also 3 runs typed during a forced first voice (talk control picked a member natural activation had not drafted): same result. 3 director runs never reached a second voice (unexercised, not counted).
- Slash draft `/echo SLASHPROBE<n>` mid-chain, 5 runs (3 typed during the first voice with 2-3 activated members, so the later members' `Generate` ran `processCommands` while held; 2 during a forced chain voice): commands executed 0/5 (no toast), player lines 1 per send, box still holds the slash text with caret at end 5/5.
- STOP with a draft, 7 runs (3 during the first voice, 2 during a forced first chain voice, 2 during the second chain voice): draft and caret intact 7/7, player lines 1 per send, chain end `stopped` 7/7 (voices 0 or 1), max open wrappers 1. In 1 run ST's loop still called the next activated member after STOP; it was held (20 ms) and released.
- Once each: plain send naming two members, no draft: 1 player line, 2 voices, chain end `director` 2, the held members' holds stashed an empty box (harmless; one window 1,483 ms). Swipe in the group: new swipe on the last reply, no player line, then the `afterSpeak` NPC line through a forced wrapper (held, empty box). Impersonate: text written into the box, no player line, no hold (impersonate does not read the box). The model's impersonated text degenerated into a repetition loop (model output, unrelated to the guard).
- Phone viewport (`390x844` set on the page), 2 runs of the first-voice case: holds 3 (20-97 ms), box focused at the start and end of every hold and in every 15 ms sample while held, 1 key dropped, draft kept. A real soft keyboard's reaction to `readOnly` (iOS/Android may hide it) cannot be observed in desktop Chromium emulation; unverified.
- Keystrokes during the hold window: across all runs 2,060 keys typed, 10 dropped (0.5%), all in the 7 continuous-typing runs (1,455 keys, 14 holds, 0-2 dropped a run, about 0.7 a hold); every dropped key is one typed while a later member's `Generate` held the box. Hold windows over all 56 holds: min 10.7 ms, median 54 ms, max 1,483 ms (the no-draft plain send; the longest window with typing was 155 ms). No dropped key was posted or ran as a command; the cost is a missing letter, as the gate record predicted.
- Overlapping group generations: 0 (max open wrappers 1 in every run).
- Not a reproduction count: the unguarded control was not rerun live (stage 3 integration saw 1 of 5; the jest controls cover it).
- Observation, not observed live: the outer `Generate` that ST runs before delegating to the group wrapper (`script.js` `:4299`/`:4311`) runs `processCommands` on the box before any wrapper exists, so the guard does not cover it. For the player's own send that is the intended read; for a forced voice the window is from `startVoice`'s draft check to `:4311` (one `unshallowCharacter` await and the `GENERATION_STARTED` listeners).
- Cleanup: both test stories removed from the lane library; `so-run-header diff --served-identity --owned <6 chats>` (through `st-lanes run 35`) against the pre-run capture differs only in the 6 owned chats and the page's open chat/group/story (baseline had none open), as in stage 3. Holder stopped, lane 35 stopped and returned to no-model (its state before), controller left running as found. One director run was cut mid-send by a harness restart (chat B, no record); one scripted run sent during the opening hook and was discarded (the line stayed in the box, no player line).
- Evidence: `C:/dev/so-lanes/35/debug/dg/` (`dg-driver.mjs`, `runs/*.json` one per run, `runs/driver.log`, `race.story.json`, `scripted.story.json`, `setup-*.log`, `hold.log`, `header-diff.txt`, `seed.log`), run headers `C:/dev/so-lanes/35/debug/run-header-dg-{pre,post}.json`. Not archived to so-sessions.
- Verdict: **draft guard green live** (0 stray player lines, 0 commands run, drafts and caret intact in every run, 0 overlapping wrappers, chain ends as before). Known cost measured: about 0.7 keys lost per hold while typing continuously; mobile soft-keyboard behaviour unverified.

### Live recheck, defects 4 and 5

Date 2026-10-27, master `b170f25a` as staged in ST's extension slot (no route holder); docs-only branch `v3.0-keeplast-recheck`.

- Served: lane 35 in-page `dist/index.js` sha256 `05953b682f0e` = `dist/manifest.json` (commit `b170f25a`), 1,258,315 B, same at the end of the run. Lane 35 `adolion-fresh.mts seed 35` (campaign pin `c5723c5`, 0 problems, 0 drift), started `--allow-local --headed`; local controller Artemis 31B v1.1, thinking on, `max_context` 32768; images and sprites off. Lane 34 ran another agent's work on the same model. Lane 0 and the owner's ST untouched.
- Instrument (previous gate's, adjusted for the new listener): a capture listener placed first on `MESSAGE_RECEIVED` and re-placed first on every `GENERATION_STARTED` (registered after the repair's re-placement, so it still runs ahead of the repair chain: first in 33 of 33 replies), a late listener for the posted text, a wrap of `takeAskingPlayer`, and a wrap of the effects applier's `awaitsPlayer` dep (the `afterSpeak` check) recording the last reply's text at the moment it is read. Wait = scheduler idle + 45 s quiet.
- 15 fresh opens over all 8 hook groups, identity kept: lines before the first send 2 in 15 of 15 (opening line + hook, 0 scripted lines).
- Defect 4: 9 trims (7 first hooks, 2 repair swipes; 8 from 2 questions to 1, 1 from 3 to 1; 5 to 10 words removed). The `afterSpeak` check read the trimmed text in **9 of 9** (140 to 329 ms after the reply arrived; its text equals the posted and current message), and the generated text in 6 of 6 untouched hooks. Last question kept, other sentences intact, `extra.reasoning` unchanged, `swipes[swipe_id]` and the saved chat file equal the trimmed text, one journal line each: 9 of 9. The next extraction read held the trimmed hook and none of the dropped sentences, 9 of 9.
- Defect 5: thought-only first hook in **3 of 15** opens. Each time the empty reply was not marked (`takeAskingPlayer` not called for it) and the empty-reply repair swipe took the mark (3 of 3); 2 of those swipes asked twice and were trimmed to the last question, 1 asked once and was left as generated.
- Ordering: no leaked thought in a visible reply in 33 replies (reasoning unchanged on every reply), so thought-leak before keep-last was not exercised live; the order rests on `runtime/replyRepairs.test.ts`.
- Non-asking replies (15 opening lines, 3 thought-only replies): 18 of 18 untouched.
- Cleanup: `so-run-header diff --served-identity --owned <15 chats>` (through `st-lanes run 35`) against the pre-run capture differs only in the page's open chat/group/story (baseline had none open) and exactly the 15 owned chats; no settings, library, lorebook or wizard drift. Lane 35 stopped and re-seeded offline (`SO_LANE_OFFLINE=1 st-lanes seed 35 --fresh`: no-model). Controller left running as found.
- Evidence (counts only): `C:/dev/so-lanes/35/debug/keeplast/recheck/` (`r*-open.summary.json`, `r*-open.awaits.json`, `owned.txt`, `header-diff.log`, `lane-stop.log`, `reseed-offline.log`), run headers `C:/dev/so-lanes/35/debug/run-header-keeplast-recheck-{pre,post}.json`. Hook texts and scripts (private): `C:/dev/so-lanes/reviews/keeplast-recheck-2026-10-27/` (`runs/*`, `instrument.js`, `awaits.js`, `probe.js`, `analyze.js`, `kl.sh`, `opens.sh`, `seed.log`). Not archived to so-sessions.
- Verdict: **defects 4 and 5 fixed live** (the `afterSpeak` check reads the trimmed hook 9 of 9; an empty first hook keeps the mark for its repair swipe 3 of 3, trimmed when it asks twice 2 of 2). Thought-leak ordering not observed live.

### Gate record, talk fixes C (living pacing, empty retry, speech id)

Date 2026-10-27, branch `v3.0-talk-fixes-c` (worktree `C:\dev\so-talkfixc`; `C:\dev\so-talkfix` still holds the stage 2 fixes branch with uncommitted work, left alone) from master `d9ff15db`. Fixes defects 1-3 of the campaign talk stage 2 live gate (`v3.0-campaign-talk-s2` `837ee7c1`, not merged here). CPU only: no lane, GPU or owner ST.

- C1 living pacing. Cause: `buildDirectorOps`/`buildBranchOps` wrote `liv_` checkpoints with no `talk_control`; `TalkController.intercept` returns at once without one, so ST's own group activation chose every voice (7 in one send), and with no `talk_defaults` the speech budget was `null`. Fix: `generation/living/talk.ts` `livingTalkControl(source, talk_defaults)`: the turning point, its stub and a branch stub copy the frontier's (branch: source's) `talk_control`; a scripted chain becomes a director chain (`mode`/`sequence` dropped, `max` etc. kept), `opening` becomes `conversation`; a source with none gets `{ profile: talk_defaults.profile ?? "conversation" }`. The director draft has no talk field; `checkDirectorOps` now refuses any generated checkpoint whose `talk_control` differs from the inherited one (at proposal and again at apply), so it cannot set, drop or widen it. Already-persisted ops from before the fix keep no control (no migrations); a fresh chat is needed.
- C2 empty retry. Cause (evidence: the 10 `not-asked` recoveries in the run, every one a chain voice that was not the chain's last; the 1 retried empty was a chain's last voice): `advanceChain` counted a thought-only voice and launched the next one, so by the time `EmptyReplyRecovery` could act the reply was no longer last ("another message followed") or the chain outlived the 60 s wait ("still busy a minute later"). Fix: host `replyEmpty(messageId)` (`isThoughtOnlyReply` with the live residue tags); a chain whose voice came back thought-only ends with the new reason `empty` (counted as a voice), so the reply stays last and the recovery swipes it once. Decision: the voices after it are skipped, not resumed after the swipe (a resumed chain would need a second wrapper path; one real reply beats a chain over an empty one). Not covered: an empty reply followed by an `onEnter`/scripted line in the same send, and ST's own multi-member pass on a beat without `talk_control`, still report `not-asked`.
- C3 speech id. Cause: `settleVoice` took `getLastMessageId()` when the last speaker equalled the expected voice; an `onEnter` line posted (`/sendas`, type `command`) after the voice made it null (other speaker) or the entry line's id (same speaker). Fix: `TalkController.onReplyRendered(messageId, type)` from `MESSAGE_RECEIVED` records the chain's own `normal` render (id + speaker); settle uses it (`talkChainReads.ts` `voiceMessage`), the no-repeat speaker list too; hosts that report no render keep the old reading. `recordYield` moved to `talkChainReads.ts` to keep `talkControl.ts` under the 600 effective-line file budget.
- C1b living opening (coordinator, after the first commit): the synthesized `liv_open` of a premise-only story gets `talk_control: { profile: talk_defaults.profile ?? "opening" }` (`engine/validate/living.ts` `livingOpening`, fed `json.talk_defaults` from `validate.ts`; the `opening` profile exists and fits: 2 voices, lead first, address after 1), consistent with authored openings. Director checkpoints written from it inherit it (`opening` read as `conversation`). The director cannot rewrite it: an op naming `liv_open` is refused as an existing id and for a non-inherited control. Test: `talk.test.ts` "a fully living story's opening ..." (5 tests in the file now).
- Tests: `src/generation/living/talk.test.ts` (4: inherit + scripted/opening normalisation + resolved budget, default/fallback profile, branch stub, refusal of dropped/widened/invented control), `src/runtime/talkVoiceSettle.review.test.ts` (6: entry line by another member / same member keeps the voice row, control without render hook; empty first voice ends `empty` and the recovery asks again, empty second voice, control with text).
- Guide: talk-pacing (living inheritance) and talk-control (`empty` chain end) in `docs/authoring/story-guide.md`, `npm run docs:guide`.
- Gates: `npm run gates:quick` green (typecheck, typecheck:test, lint, jest related, replay --cached). `npm run gates` (no `--resume`, Storybook included): all green in 479.1 s, 11/11 steps; jest 930 suites passed (1 skipped), 10753 tests passed (1 skipped); test-storybook:ci 474.9 s. Main bundle 1,260,784 B (master 1,260,046; +738).
- Gates after C1b: `npm run gates:quick` green; `npm run gates` (no `--resume`, Storybook included) all green in 368.3 s, 11/11 steps; jest 930 suites passed (1 skipped), 10754 tests passed (1 skipped). Main bundle 1,260,800 B.
- Ownership census and other guards unchanged (no new write-after-await site).
- Live check owed (lane, real model, campaign story without `talk_defaults`): (0) a premise-only story: `liv_open` reads `{ profile: "opening" }` and its first sends hold 2 voices; (1) let the director branch into a `liv_` beat, read `getActiveTalkControl()` there = the source beat's control, and voices per send <= its budget over 10 sends (`so-talk-metrics --budget`); (2) thought-only chain voices: `chainEnds` reason `empty`, the empty reply swiped once (`emptyReply` records `asked-again`), no `not-asked` "another message followed" for chain voices; (3) entry turns (`onEnter` line in the first send of a beat): the chain's speech row names the voice's message, never null or the entry line's id.

#### Live gate, talk fixes C (2026-10-28)

- Build: branch `v3.0-talk-fixes-c`, built in the worktree and served to model lane 36 by the CDP route holder (`candidate-hold.mjs`, worktree `dist/`); nothing staged, owner ST untouched. Served `dist/index.js` sha256 read in-page after every reload: `fae06966acb7` (`21567348`, P1), `501b4668355c` (`f82feb10`, P2), `2b5632ab18cd` (`d929aae2`, C1), `6474e87ec412` (`64429cf6`, C2, branch turns and plumbing); 0 chunk 404s. Lane 36 `adolion-fresh.mts seed 36` at campaign pin `c5723c5` (0 problems), restarted `--allow-local --headed`; local controller (Artemis 31B v1.1, thinking on, `max_context` 32768); images and sprites off. The end-batch agent shared the GPU (lanes 45/33) and ran image work: the controller swapped text out repeatedly, some turns waited minutes, and 4 generations were refused with 409 "Not enough free GPU/physical RAM" (environment, counted below where they landed).
- Chats: P1 and P2 on a synthetic premise-only story (`living.premise`, no checkpoints, no `talk_defaults`) in the toy group "Group: Arin, DM Narrator"; C1 and C2 on two campaign stories (living off at the pin, branching and prefetch on by default; no `talk_defaults`, beats with `talk_control` and no profile). Real generation (`st-actions send`), real director, expansion, judge and extraction passes; probe after each step = not generating, scheduler idle, no empty-reply recovery pending, 20 s quiet.
- (b) premise-only opening, 2 of 2:
  - P1 and P2: `liv_open` reads `{ profile: "opening" }`, effective policy 2 voices / 3 generations.
  - Sends on `liv_open`: P1 3 (1, 1, 1 voices), P2 11 (1 or 2 voices; max 2, never over). Chain ends `yield`/`judge`.
- (a) living inheritance, 2 of 2 (toy) + 2 of 2 (campaign branches):
  - P1/P2: every `liv_` checkpoint the director wrote (P1 4, P2 8: turning points and stubs) reads `{ profile: "conversation" }` (the opening's profile, `opening` read as `conversation`), budget 3.
  - New defect found in P1 (pre-fix build): beats background generation wrote into a living stub (`gen_liv_2_way_1/2`) had no `talk_control`, so ST's group activation chose the voices again: 4 sends there took 1, 2, 4 and 3 voices (4 over the inherited budget of 3). Fixed on the branch (`f82feb10`: generated stretch beats copy the stub's `talk_control`; test `generation/mergeStubTalk.test.ts`, fails without the fix).
  - P2 (fixed build): 17 sends starting in `liv_`/`gen_` beats (5 in `gen_` beats; the 4 `gen_` beats each read `{ profile: "conversation" }`), voices per send max 2 (budget 3), every send chain-controlled.
  - C1: two prefetched branch stubs (`liv_b1_way`, `liv_b2_way`) each carry a `talk_control` byte-identical to its source beat (director chain, `max` 2); the expansion beats filled into the second stub (2) carry it too. 4 sends on the stub: 2 voices, 2 voices (end `cap`), 2 sends lost to controller 409s (0 voices).
  - C2: branch stub identical to its source beat (no chain field, budget 3); 4 sends: 1, 1, 2, 1 voices; plus 5 plumbing sends (below) 0-1 voices. No send over budget in any `liv_`/`gen_` beat on a fixed build (was 7 in one send before).
- (c) empty chain voice:
  - Forced (plumbing, labelled): an in-page `MESSAGE_RECEIVED` listener moved the first chain voice's text into `extra.reasoning` (`instrument.js`, `__tfcForceEmpty`), on a director beat with budget 2. 2 of 2 (C1, C2): chain end `empty` with 1 voice, no second voice started, `emptyReply` record `asked-again`, ST swipe rendered on the same message (2 swipes, new text).
  - Real: 3 thought-only chain voices occurred naturally (P2 twice: a chain first voice and a spotlight first voice; C2 once: a chain second voice). All 3: chain end `empty` (voices 1, 1, 2), `asked-again`, swiped once. 0 `not-asked` records in any chat.
- (d) speech row on entry turns (`onEnter` line posted in the first send of a beat), 3 of 3 valid:
  - C1 beat A (entry line by the same member as the first voice) and C2 beat B (same member): the chain row names the voice's own message, not the entry line's id; C2 beat A (entry line by another member): rows name both voices' messages, never null.
  - New defect found: on C1 beat B both voices failed (controller 409) and their rows named the player's own line; after a reload, a failed first voice did the same (C1 branch turn 1). Fixed on the branch (`d929aae2` + `64429cf6`: a voice that rendered nothing names no message when the host reports renders or the player's line is still last; a host reporting neither keeps the old reading). Test `runtime/talkVoiceSettle.review.test.ts` (fails without the fix).
  - Re-check on `6474e87ec412` (plumbing, labelled: an in-page `fetch` wrapper answered the next N `/api/backends/text-completions/generate` calls with 409, `failseam.js`): with renders already seen, the failed voice's row is `null` and the next voice's row names its message (2 of 2); straight after a reload with every generation refused, the row is `null` (1 of 1).
- Cleanup: the synthetic story removed from the lane library. `so-run-header diff --served-identity --owned <4 chats>` (through `st-lanes run 36`) against the pre-run capture differs in the build (the three deliberate rebuilds), the page's open chat, group and story (baseline had none open) and exactly the 4 owned chats; no settings, library, lorebook or wizard drift. Holder and lane 36 stopped; the lane is left seeded at campaign `c5723c5` (it was a no-model lane before). Controller left running as found.
- Evidence (counts only in this record): `C:/dev/so-lanes/36/debug/talkfixc/` (`runs/*-{turn,cp,open}.json` + logs, `instrument.js`, `probe.js`, `failseam.js`, `tf.sh`, `turns.sh`, `camp-chat.sh`, `branch.sh`, `premise.story.json`, `hold.log`, `header-diff.txt`, `owned.txt`, `seed.log`, `gates-quick*.log`), run headers `C:/dev/so-lanes/36/debug/run-header-talkfixc-{pre,post}.json`; archived with `so-evidence.mts archive --label talkfixc`.
- Verdict: **fixes (a)-(d) green live**, with two defects found and fixed on the branch during the check (`gen_` beats in a living stub unbudgeted; failed voices naming the player's line).
- Gates after the live-check fixes (`175a13c5`): `npm run gates:quick` green after each fix; `npm run gates` (no `--resume`, Storybook included): first run RED only at `test-storybook:ci` (port 6006 held by another agent's Storybook, `EADDRINUSE`; every other finished step green), rerun once the port was free: **all green in 263.7 s, 11/11 steps**; jest 931 suites passed (1 skipped), 10757 tests passed (1 skipped). Main bundle 1,261,034 B.

#### Blind pacing rating, redo after the party-limit and talk fixes C (2026-10-28)

- Build: master `fe50b961` merged into this branch (`1708b233`); pin bumped to campaign `6d82dea` (`talk-s2-adopt`: party limits on spotlight/reaction/address, `allow_nonparty` on 2 beats, `talk_defaults` on 9/9 stories, preflight). Campaign `scripts/check_all.sh` green; `npm run gates:quick` green (typecheck, typecheck:test, replay `--cached` 32/32).
- Lane: model lane 34 only (another agent held lane 42), `adolion-fresh.mts seed 34` at `6d82dea` (0 problems; drift = pin + 9 library hashes), restarted `--allow-local --headed`. Served the staged master bundle (in-page sha256 `a01972d0e7a8`), no holder. Local controller, Artemis 31B v1.1, thinking on; images and sprites off. Probe after each step = scheduler idle + 20 s quiet.
- Floors declared before any scoring (`rating/floors.json`, 05:10Z), the same as the 2026-10-27 pair, not retuned: F1 ON overall mean >= OFF overall mean; F2 ON responsiveness median >= 4. Decision (owner): adopt only if the profiles win or tie, i.e. F1 and F2 both pass on the scored pass.
- Material: 13 paired beats over 5 stories, 5 scripted player lines per beat, identical in both arms (65 player lines per arm), one new chat per story per arm, beats reached with `/cp activate`; living and branching off per chat except the last story's board and living beats (living on).
  - Beat kinds (ON profile): 1 opening (opener + hook + 5 turns), 6 conversation, 4 action, 1 decision, plus 2 living director beats (`liv_1`, `liv_2`, inherited `conversation`) reached naturally in both arms.
  - OFF arm: the same stories with `talk_defaults` and `talk_control` `profile`/`budget`/`lead_words`/`spotlight`/`address_player`/`reaction`/`lead_max_consecutive` stripped (47-59 keys per story), imported over the lane library for the OFF chats only, originals re-imported after (hashes back).
  - One OFF beat drifted from its conversation beat into a generated road beat (no `talk_control`) mid-beat; kept as played.
- Objective (chat files): voices per beat ON 112, OFF 115 over 65 player lines each; thought-only replies ON 4, OFF 3.
- Rater: `codex exec -m gpt-6.1-sol -s read-only`, empty cwd, 4 calls of 3-4 scenes, A/B randomised per beat (key apart), rubric pacing, responsiveness, companions, space, overall (1-5) + preference; no arm markers in the excerpts.
  - Pass 1 (scored): ON overall mean 3.15, OFF 3.31 (medians 3 / 3); ON responsiveness median 3 (mean 3.46), OFF median 4 (mean 3.69). Pacing ON 3.08 / OFF 2.92; companions 3.38 / 3.46; space 3.92 / 3.77. Preference ON 6, OFF 6, tie 1.
  - Pass 2, labels swapped (position check, not scored): ON overall 3.23, OFF 3.31; ON responsiveness median 3, OFF 4; preference ON 7, OFF 5, tie 1.
- **F1 FAIL (3.15 < 3.31), F2 FAIL (median 3 < 4). Not adopted**: branch stays unmerged, campaign `talk-s2-adopt` not merged, nothing installed. Better than the first pair (preference was OFF 2/2, overall 2.0 vs 3.5) but still below both floors.
- Failure patterns (rater reasons, neutral, both passes):
  1. Two party members addressed in one player line: under the profile budget only one answers (2 beats lost on this; a third missed it in both arms).
  2. A physical player action left without a result while companions talk (2 beats).
  3. Decision beat: the lead repeats its appeal and a companion answers a question addressed to the lead.
  4. A companion's unsolicited side exchange takes the first voice instead of answering the player.
  5. Living beat: the director's thread is pushed back into the scene where the player asked for concrete results (content, not turn-taking).
  - Profiles won on: action beats (each combat or climb action resolved, tighter rhythm), crowded social openers (fewer stacked introductions, more openings for the player), one conversation beat (less repetition).
- Incidents:
  1. The first OFF run of the fifth story was void: a New Game+ carry picker ("Previously" popup, Continue/Cancel) opened on the second chat of that story and blocked every send (`SEND-NOT-POSTED`, chat stayed at 2 messages). Cancelled, the chat set aside, the story rerun in a new chat with the popup dismissed at open (none appeared). A living pass forced on the void chat during diagnosis is not part of the material.
  2. Harness: 6 attach timeouts deleted the lane's `session.json` (restored before the next call; every beat checked at 5 player lines in both arms); one end-of-beat probe ran on a page without the runtime and was rebuilt from the chat file.
- Cleanup: library restored; `so-run-header diff --served-identity --owned <11 chats>` differs only in the owned chats and the open chat/group/story (baseline had none open). Lane 34 stopped, left seeded at campaign `6d82dea`. Controller left running as found.
- Evidence (private): `so-evidence.mts archive --label camps2-r2` + the rating dir and the 11 chats under `evidence/phase-c/camps2-r2/lane-34/camps2r2/` in so-sessions (`npm run sessions:archive`, pushed `6bc85d6a`). Working copy `C:/dev/so-lanes/34/debug/camps2r2/`.
