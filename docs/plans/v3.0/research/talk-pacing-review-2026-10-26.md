# Talk control and conversational pacing review (2026-10-26)

Read-only review. Trigger: the owner's playtest of the private campaign. The narrator's opening is good, but
nobody from the party speaks next, so the player is not pulled in. Wanted: a party member turns to the player
(for example with a question), and more talk controls for pacing.

Sources: `src/talk/**`, `src/runtime/talkControl.ts`, `src/runtime/wiring/talk.ts`, `src/services/stHost/voiceStart.ts`,
`src/runtime/effectsApplier.ts`, `src/runtime/effectSteps.ts`, `src/runtime/openerDeferral.ts`, `src/runtime/npcReplyRewind.ts`,
`src/runtime/turnBridge.ts`, `src/judge/director.ts`, `src/engine/agency.ts`, `src/pacing/steering.ts`, `src/pacing/guidance.ts`,
`src/engine/schema.ts`, `docs/authoring/story-guide.md` (npc-replies, talk-control, opening cast), plans v2/14 and v2.5/18.
Campaign figures are counts only (private repo). Owner chat: roles and counts only.

## 1. Answer: an "opening hook" at chat start today

Short answer: **only with a verbatim scripted line, and only by accident of ordering**. An LLM-written hook that
reliably addresses the player cannot be authored today, because the `instruction` of an `llm` reply is dropped
(bug B1 below).

### Exact path, fresh group chat

1. ST posts card greetings (`first_message`) before `CHAT_CHANGED`. They are not turns (`turnBridge.ts:16-20`), so
   no boundary, no `afterSpeak`, no talk chain. The campaign has 0 of 147 cards with a `first_mes`, so this step is empty there.
2. `loadStory(..., "activate")` → `effects.applyCheckpoint` (`runtimeManager.ts:525`).
3. `applyCheckpointNow` posts the **`new_chat_only` opener first** (`effectsApplier.ts:186-190`, `:211`). This happens only if
   the chat is empty (`:488`), requirements are ready and identity is settled. Validation allows `new_chat_only` only on a
   **scripted** `onEnter` reply (`validate/checkpoints.ts:129-131`).
4. Staging follows: world info, author note, preset, background, cast. On a large roster, `cast_changes` writes members one
   await at a time (the comment at `:205-210` says "the better part of a minute").
5. Last step, `activate` only: `fireOnEnter` (`:262`, `:437-449`) fires every **non**-`new_chat_only` `onEnter` reply in
   declaration order (`:471-513`). Before that, `holdOpener` defers the whole set when the last non-system message
   "addresses the player" (`openerDeferral.ts:24-47`). Without quoted speech, that means the last sentence ends with `?`.
   With quoted speech, it means one of the last two quoted lines has `?`, "you" or the player's name. A deferred set
   waits for a player line and fires at the next `afterSpeak` (`effectsApplier.ts:456-465`).
6. A `kind: "llm"` reply is `/trigger await=true <position>` (`effectSteps.ts:66-75`). **`instruction` is never sent.**
   `text ?? instruction` is read but used only on the scripted branch. A `/trigger` is a forced generation, so
   `TalkController.intercept` returns early (`talkControl.ts:215`) and no chain opens (`:202-204`).
7. The posted reply is a turn and commits a boundary. `afterSpeak` replies do **not** react to it, because
   `lastSelfInjectionMessageId === lastMessageId()` (`effectsApplier.ts:474`, `:512`). So `after_member: <narrator>` can
   never chain off the opener or any other NPC-reply line.

What an author can do today:

- **Works:** start-checkpoint `npc_replies` = `[narrator scripted new_chat_only, member X scripted onEnter]`. X's line lands
  after staging, possibly up to a minute later, and only if the opener does not end on a question (else it waits for the
  player). The text is fixed and canned, and it fires only on the first visit (`maxTriggers` defaults to 1 per key for
  the whole chat, `npcReplyMayFire`, `npcReplyRewind.ts:28-34`).
- **Does not work as documented:** `[narrator opener, member X llm onEnter with instruction "turn to the player and
  ask…"]`. X generates with no instruction, steered only by the beat's shared guidance and X's
  `guidance.members[X]` line. That direction is private to X but lasts the whole beat (`pacing/guidance.ts:18`), so it
  cannot express "once, right now".
- **Fights the hook:** with the default agency policy, every steering hint and every `player_action` objective line
  carries `NO_CLOSING_QUESTION_CLAUSE`: "never on a question asking {{user}} what they do" (`agency.ts:32-37`,
  `steering.ts:24-25`). The clause is aimed at GM-style "What do you do?", but the model can read it as "no questions
  to the player".
- **Untested ordering risk:** the new_chat_only opener waits for identity (`openNewChat`, `:187`), but `fireOnEnter` at
  `activate` does not. With a story that needs the identity pane and has no fixed name, `requirements.ready` can be true
  while identity is pending (`requirementsRead.ts:65`). A start-beat X line could then land **before** the opener,
  which waits for the hydrate after identity. `playerSetupActivation.test.ts` covers only the opener. Latent: no
  campaign start beat has a second `onEnter` today.

### Later beats

On a transition, `onEnter` replies fire at the boundary in the same way (`applyActive(..., gate)`). The running chain ends
when the entered beat posts an opener (`sceneMoves`, `talkControl.ts:305-310`, `wiring/talk.ts:31-33`). The same three
limits apply: instruction dropped, deferral when the previous reply addressed the player, no `afterSpeak` off
self-posted lines. Inside a beat, a party member reaches the player only through the chain (section 2).

## 2. Every pacing lever that exists, with limits

Speaker choice (`talk_control`, per checkpoint; absent = ST's own group activation, `runtimeManager.ts:383`):

- `speakers[{member,weight}]`, `lead`, `no_repeat`, `allow_silence`, `director` (`true` or `{instruction}`):
  `schema.ts:179-212`. Decision order: forced trigger > single addressee of the player's latest line > judge director >
  single name mention > LLM director > weighted rules (`talkControl.ts:421-445`).
  - The lead is preferred whenever the last message is the player's (`sceneWork`, `:447-452`; rules `rules.ts:131-135`;
    judge lead bonus `director.ts:38-41`, `:94-96`). So with a narrator lead, **the narrator answers every player line
    first**.
  - Weights do not reach the judge or the LLM director. They only steer the rules fallback (guide says so).
  - There is no memory of who has been quiet. The judge sees an 8-message window (`DIRECTOR_WINDOW_MESSAGES`).
  - The judge needs a role for every candidate, else `no-roles` and fallback (`directorEligible.ts`). Calibration passes:
    22/25 = 0.88 against a 0.85 floor (`test/goldens/judge/director.calibration.json`).
- `chain` (`mode director|scripted`, `max` 1-8, default 3, `sequence`, `stop_on_transition`, `stop_on_player`,
  `hold_extraction`): `talkControl.ts:43-60`, `:278-359`.
  - Only a loud, non-forced `normal` user turn opens a chain (`:213-222`). The opening, NPC replies, `/trigger`, swipe
    and continue never do.
  - Each step: a member the player's line addressed who has not answered goes first (`mention`). Otherwise the judge or
    director picks, with **PLAYER** (hand-back) offered when `stop_on_player` (`:330-343`).
  - **No yield on a question:** if voice 1 ends on a question to the player, the chain still asks the judge again. A
    second voice can then bury the question. Only the judge's hand-back can stop it.
  - With no judge and no LLM director a chain does not continue (`decideChainSpeaker` returns null), by design.
  - The chain ends on a player send, STOP, a quiet/swipe/continue wrapper, a failed voice start (`voiceStart.ts`,
    `VOICE_BUSY`, `VOICE_DRAFT`), or a transition / opener-posting beat.
- `rules.ts` mention matching: name words, alias, and the exclusion grammar ("don't tell X") (`rules.ts:43-65`).
  `directAddress.ts` vocative detection is used for member addressees. **Nothing detects "a member addressed the player"**
  except `openerDeferral.addressesPlayer`, a coarse heuristic used only for opener deferral.

Lines a character speaks on their own (`effects.npc_replies`, `schema.ts:166-177`, `effectsApplier.ts:471-513`):

- `trigger` `onEnter` | `afterSpeak` | `sceneBreak`; `kind` `scripted` (`/sendas` verbatim) | `llm` (`/trigger`).
- `new_chat_only`: scripted `onEnter` only, empty chat only.
- `after_member`: afterSpeak only, matched on the last speaker's aliases.
- `maxTriggers`: default 1, counted for the whole chat per `checkpoint:trigger:member:index`, not per visit.
- `probability`: seeded roll.
- Spacing: afterSpeak and sceneBreak need 8 messages since that reply's last fire (`NPC_REPLY_SPACING`, `npcReplyRewind.ts:19`).
- `enabled`.
- Limits:
  - **B1** `instruction` is ignored (above).
  - afterSpeak never follows a self-posted line (`:474`).
  - A line is held when the queued writes move the story elsewhere (`heldLine`).
  - Scripted text has no time or place check.
  - There is no test of `afterSpeak` firing while a chain is choosing its next voice. Both try to start a generation;
    the loser is refused quietly (`voiceStart` busy). Unverified interplay.

Prompt-side pacing (shared or private blocks):

- Tension steering hint (escalate/hold/ease) with `NOTHING_NEW_CLAUSE` ("hand the scene back … in one short beat")
  and, by default, the player clauses plus `NO_CLOSING_QUESTION_CLAUSE` (`steering.ts:24-49`).
- Shared `guidance`, private `guidance.members[name]` ("Direction for X only", `pacing/guidance.ts:18`), objective line
  with `objectiveClause` (`agency.ts:34-37`, applies unless the beat has its own author note), open stretch / pull
  lines (`steering.ts:61-75`), encounter offers.
- `agency` (`protect_player_choice`, `never_narrate_player_action`, `objective_kind`, `player_attempts_only`,
  `alternate`) with defaults in `agency.ts:7-12`.

Not a reply-pacing lever, despite the name:

- `target_turn_length` is the stall re-read cadence (`extraction/reconcile.ts:78`). It does not set reply length.
- No talk control sets reply length or caps consecutive lead turns. Length comes from the preset and the thinking budget only.

UI:

- `yourMove.ts` shows "your move" only after a recorded hand-back decision.

## 3. Campaign usage (counts only; 9 built stories, 307 checkpoints)

Talk control:

- `talk_control` on 285 of 307 checkpoints.
- `lead` on 285; the lead is the narrator on 245.
- Median lead weight share is 0.22 (min 0.06, max 0.60). This matters only for the rules fallback.
- `director` with an instruction on 283 checkpoints. `allow_silence` on 0. `no_repeat: false` on 131.

Chains:

- System default (on, max 3) on 160 checkpoints; `chain: false` on 2.
- Explicit chain objects on 123: max 1 ×10, max 2 ×87, max 3 ×2, max 4 ×24; scripted mode 8; `hold_extraction` 30.
- The campaign DSL gives every `player_action` beat `{max: 2}`, on purpose, so "the scene presents the choice and stops".

Objectives and guidance:

- `objective_kind: player_action` on 61 checkpoints; world_pressure (default) on 246.
- Private member guidance on 281 checkpoints.

`npc_replies`: 260 in total.

- onEnter: 113 scripted, 77 llm.
- afterSpeak: 30 scripted, 6 llm.
- sceneBreak: 34 scripted.
- 163 spoken by the narrator, 97 by party/other members.
- Of 83 llm replies, **2 carry an `instruction`**, which is ignored anyway. 6 have a probability, 2 an `after_member`.

Openings:

- All 9 stories open with **exactly one narrator scripted `new_chat_only` line**: 0 quoted speech, 0 question marks,
  332 to 1,174 characters.
- **0 of 9** has any party-member line at the start.
- The opening generator deliberately strips `onEnter` llm replies from the start beat when it inserts the narrator
  opener (`scripts/campaign/openings.py`, main). Guide rule 22 encourages this ("none when an entering reply already
  introduces the character").
- Start beats: 6 of 9 are `player_action` (so the no-closing-question clause is in the objective line). All 9 have
  private member guidance.

## 4. Owner playtest evidence (group chat 2026-10-26@13h36m42s, the only one today)

- Rows: 2.
  - Row 0: the narrator's scripted `new_chat_only` opener, 1,174 characters, no quoted speech, no question.
  - Row 1: a system row carrying the opening illustration.
- No player line, no party-member line, 0 talk decisions, 1 fired NPC reply, boundary 1.
- Start beat: 6 speakers (narrator lead + 5 members), chain max 3, `no_repeat: false`, `player_action` with
  `player_attempts_only`, private guidance for 4 members.
- Turns before a party member spoke to the player: not reached. By construction, the earliest a party member can speak
  today is chain step 1 of the player's **first** send: the narrator lead answers first, then the judge chooses between
  a member and PLAYER. The opening itself cannot produce one.

## 5. Bugs and gaps (ranked)

1. **B1: `kind: "llm"` NPC reply `instruction` is dropped** (`effectSteps.ts:66-75`). The guide (`story-guide.md:326-327`),
   compact guide (`guideTopics.ts:211`), Studio field (`EffectsEditor.tsx:153`) and wizard all promise it. 81 of 83
   campaign llm replies have no instruction, so they speak blind. This is the blocker for an LLM-written hook.
2. **No opening hook path.** `new_chat_only` is scripted-only, and `afterSpeak` never follows the opener. The follow-up
   `onEnter` waits for all staging (up to a minute on a large roster).
3. **The agency clause discourages any question to the player** (`NO_CLOSING_QUESTION_CLAUSE` in every steering hint and
   every player_action objective line). The intended ban is narrower: GM prompts like "What do you do?".
4. **Chains do not yield when a voice asks the player something.** Another voice can follow and bury the question.
5. **The lead answers every player line first** (`sceneWork`), and there is no limit on consecutive lead turns or lead
   length. Combined with chain max 2 on decision beats, a party member gets at most one line per player send, and only
   when the judge does not hand back.
6. **No spotlight memory.** Quiet members stay quiet; weights only affect the rules fallback.
7. **Untested orderings:** a start-beat `onEnter` versus identity pending (section 1), and `afterSpeak` versus chain next-voice.
8. **Doc wording:** "maxTriggers caps repeats per beat" is really per chat per reply key (revisits do not re-arm it).
   `target_turn_length` reads like reply length.

## 6. Proposals

Cost frame:

- One player send = N loud generations on the local 31B, thinking on, with a member-cache switch per voice
  (~3.8 s warm, v3.0 09).
- Prefer levers that **replace** a voice or stop a chain over levers that add one.
- Every new injected text must stay late in the prompt (cache rule), go through `INJECTION_REGISTRY`, be withheld for
  quiet/impersonate, and be rated blind before adoption (agency and prompt layout are quality-rated).

### P1. Honor `instruction` on llm NPC replies (fix B1)

- **Schema:** none (field exists).
- **Plug-in:**
  - `EffectsApplier.speak` arms a one-shot private direction for that member before `/trigger`:
    "Direction for X only, this reply: <instruction>". This is a new registry key, or the drafted-member guidance slot
    with a one-shot flag.
  - Cleared on that generation's end, stop, chat move or `RunGuard` lapse.
  - Rendered through `withoutSecretLines` like other private blocks.
- **Interaction:** none with the chain (a forced trigger never opens one). Agency clauses still ride along.
- **Risks:** the direction leaking into a later reply if clearing fails (needs a test); an author writing the player's
  act into the instruction (add a diagnostic reusing the agency lint).
- **Test:**
  - Unit: armed, then cleared on end, stop and chat move.
  - Payload golden: the block appears only in that generation.
  - Real-LLM scenario: an `onEnter` llm with "ask {{user}} one question" yields a reply that addresses the player
    (`addressesPlayer`).
  - Update the guide and Studio copy, which are already correct once the fix lands.

### P2. Opening hook beat

- **Schema** (start checkpoint or story), either option:
  - (a) allow `new_chat_only` on `kind: "llm"`; or
  - (b) `talk_control.opening: { member, instruction?, ask_player?: true }` sugar compiling to (a).
- **Plug-in:** the "chat opening" set runs in declaration order:
  - scripted `new_chat_only` immediately (as now);
  - llm `new_chat_only` after identity is settled **and** its member is enabled (after the cast write for that member,
    not the whole staging), with the P1 one-shot direction;
  - default direction when `ask_player`: "Turn to {{user}} in your own voice and ask them one thing about what was just
    described; then stop." Skip deferral against the story's own opener.
- **Interaction:** a forced trigger, so no chain and no judge call. Counts as an `onEnter` post for rollback
  (`recordOnEnterPost`).
- **Risks:**
  - The member speaks for the player or answers their own question (the agency clauses still apply; rate it).
  - An extra 31B generation at chat start, once per chat.
  - The guide's "one opener" rule changes. Revise rule 22 to "one opener plus at most one hook".
- **Test:**
  - Unit: order (opener → hook), identity-pending hold, hook waits for its member's cast write, Restart re-arms it.
  - Journey: fresh chat on adolion-fresh produces 2 rows before the first send, the second by a non-lead member,
    addressing the player.
  - Blind rating pair (with vs without hook) on "pulled in" and "spoke for me".
- **Campaign:** the generator adds one hook per story start (owner's call, content routed to another model for review).

### P3. Narrow the no-question clause

- **Change:** keep the ban on GM "What do you do?" and add: "A character may ask {{user}} something in their own voice,
  as part of the scene."
- **Plug-in:** `agency.ts` `NO_CLOSING_QUESTION_CLAUSE` (used by `steering.ts` and `objectiveClause`).
- **Risks:** more GM-style questions creeping back. This is a prompt change that reaches every reply, so it needs a
  blind A/B on agency and pull-in before adoption.
- **Test:** payload golden diff (declared); real-LLM rating pack, two arms, Adolion sessions.

### P4. Yield to the player when a voice asks them something

- **Schema:** `talk_control.chain.yield_on_question` (default true; false = today).
- **Plug-in:**
  - `advanceChain` (`talkControl.ts:278`), after a voice: if the last reply addresses the player (a tightened
    `addressesPlayer`: last quoted line ends with `?` and names or "you"es the player), end the chain.
  - Record a `player` decision with source `rules`, so `yourMove` shows.
- **Interaction:** saves a generation and a judge call. Composes with P5/P6 (a hook voice naturally ends the chain).
- **Risks:** false positives from rhetorical questions (a missed second voice is cheap); false negatives leave behaviour
  as today.
- **Test:** unit on the detector with goldens from recorded replies; no-model scenario with scripted chain voices;
  count chain voices per send before and after.

### P5. Address-the-player beat (hook cadence inside a beat)

- **Schema:** `talk_control.hook: { after_turns: n, members?: string[], chance?: p, max?: k }` (per beat).
- **Plug-in:**
  - Code counts player turns since a non-lead member last addressed the player (the P4 detector over
    committed replies; boundary log keeps it rollback-safe).
  - When the count reaches `n`, the chain's next step picks a member (judge restricted to `members`, else rules) instead
    of offering hand-back, and arms the P1 one-shot direction: "Speak to {{user}} directly; one question or one offer;
    then stop."
  - With P4 on, the chain then ends.
- **Interaction:** **replaces** the hand-back or the next voice, so N is unchanged. The judge still decides who, and the
  lead keeps scene work.
- **Risks:**
  - Formulaic "So, what do you think?" lines; mitigate with `chance` and rotating members.
  - Pressure on `player_action` beats; default off there, or `max: 1`.
- **Test:**
  - Unit: counter, rollback ≡ replay (seeded `chance`).
  - Scenario (no-model) asserting the decision source and the armed block.
  - Real-LLM journey: metric "player turns until a party member addresses the player" ≤ n.
  - Blind pacing rating.

### P6. Spotlight rotation

- **Schema:** `talk_control.spotlight: { quiet_after: n, mode: "hint" | "boost" }`.
- **Plug-in:**
  - From the chat, compute candidates who have not spoken for `n` committed turns in this beat.
  - `hint`: add one line to the judge request ("Quiet so far: X, Y; prefer them when the reason to speak is
    comparable") and to the director prompt.
  - `boost`: add weight in `chooseByRules`.
  - Never overrides an addressee.
- **Interaction:** judge input only, so no extra generation. `likelyNextSpeakers` must use the same weights or the
  member-cache prefetch guesses wrong.
- **Risks:**
  - A member with no reason to speak forced in; keep it to `hint` by default.
  - Judge calibration is per use: a changed request needs a calibration rerun against the 0.85 floor (never retune the floor).
- **Test:** unit on the quiet set; judge calibration rerun; journey counting distinct speakers per 10 player turns.

### P7. Lead limits

- **Schema:** `talk_control.lead_limit: { consecutive: 1, brief_after?: true }`.
- **Plug-in:**
  - `consecutive`: after the lead answered a player line, chain step 1 excludes the lead (already the case with
    `no_repeat` true; 131 campaign beats set it false) and does not offer hand-back unless the lead's reply addressed the
    player.
  - `brief_after`: a one-shot private line for the lead on the next turn: "keep it to what changed; two or three
    sentences".
  - Length is prompt-side only. Never cut via `max_tokens`: that breaks thinking and the empty-reply repair.
- **Interaction:** this adds a member voice where the judge would have handed back. Pair it with chain max 2 so the
  ceiling stays.
- **Risks:** a chorus on decision beats. Default off on `player_action`.
- **Test:** scenario (no-model) on decision sources; real-LLM measurement of narrator character share and generations
  per send.

### P8. Pacing profiles per beat

- **Schema:** `talk_control.profile: "briefing" | "ensemble" | "decision" | "intimate"`, expanding to defaults:
  - briefing = lead-heavy, chain 2, hook on;
  - ensemble = spotlight hint, chain 4, hold_extraction;
  - decision = chain 2, yield_on_question, hook off, lead_limit;
  - intimate = chain false, no lead.
  - Explicit fields win.
- **Plug-in:** `validate/checkpoints.ts` normalisation only, so the runtime sees plain fields. The campaign DSL already
  has `TALK` profiles and `chain_for`, which map onto these.
- **Risks:** hidden behaviour. The Studio must show the expanded values. A guide topic is required (`guideCoverage.test.ts`).
- **Test:** validator unit; Studio story.

### P9. Reaction beat after a player action

- **Schema:** `npc_replies[].trigger: "afterPlayer"` with `after_member` reused as "react only if X was addressed",
  `probability` and `maxTriggers`.
- **Plug-in:** `afterSpeak` on the first voice after a player line.
- **Overlap:** mostly covered by P5 + P6 + the existing chain. Build it only if a rating shows the chain's reactions are weak.
- **Risk:** double voices with the chain (the same race as gap 7).

### P10. Idle nudge (not recommended to build now)

- **Idea:** when the player has not written for X minutes, a member speaks.
- **Why not:**
  - It posts unprompted, spends the GPU while the owner may be away, and can talk for the player.
  - It conflicts with "never use the GPU while the owner plays" style expectations.
- **Alternative:** surface the existing "What could I do?" card instead. Revisit only on the owner's ask.

Supporting work, any order:

- Fix the doc drift (`maxTriggers` scope; `target_turn_length`).
- Add an info diagnostic `opening-narrator-only`: a start beat whose opening has no non-lead line, pointing to P2.
- Add tests for the two untested orderings (gap 7).

## 7. Suggested order

1. P1 (bug, small, unblocks the rest).
2. P4 (code-only, saves generations).
3. P2 (the owner's direct ask).
4. P3 (needs a blind A/B).
5. P5 + P6.
6. P7 / P8.
7. P9, and P10 only on demand.

Each lands with `npm run gates`, the guide topic update, and the campaign decision (adopt, pin bump, reinstall)
per AGENTS.md. P2, P3, P5 and P7 change what the model writes, so they need a real-LLM journey on adolion-fresh and a
blind pacing rating:

- Rating: paired sessions, same seed and story, rated on pulled in / spoke for me / narrator dominance.
- Measured: generations per send and time to first token.

## Unresolved questions

- Hook placement: right after the opener, before the first send (P2), or as the first chain voice after the player's
  first send (P5 with `after_turns: 0`)? The owner's wording suggests the former.
- Should a hook be allowed to end on a question in `player_action` beats, or only as an offer?
- Default `yield_on_question` on for every story, or only via profiles?
- Campaign: one hook per story start (9), or also at chapter openings? A content pass is needed (route to another model;
  the owner plays fresh).
