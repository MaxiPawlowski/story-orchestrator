**The requested opening is partly expressible today, but it is not a reliable startup contract.** The larger issue is that speaker selection, NPC effects, and yielding to the player operate through separate mechanisms. I would unify their scheduling before adding many more controls.

This was a static, read-only review. I made no edits, ran no builds or servers, and did not access the campaign repo. The findings below distinguish code behavior from live behavior that still needs verification.

The existing foundation is useful:

- Talk control restricts normal group generations to a selected speaker, with reconciliation if ST did not draft that member.
- Scripted and director-driven chains already exist, defaulting to a maximum of three voices, with a hard schema cap of eight.
- Chains stop for STOP, new player messages, and relevant checkpoint transitions. Chained voice startup refuses while ST is busy or the player has text in the input.
- Decision caching includes chat, checkpoint, message index, and revision. Production wiring supplies seeded randomness.

See [talkControl.ts:213](C:/dev/story-orchestrator/src/runtime/talkControl.ts:213), [schema.ts:188](C:/dev/story-orchestrator/src/engine/schema.ts:188), [voiceStart.ts:15](C:/dev/story-orchestrator/src/services/stHost/voiceStart.ts:15), and [wiring/talk.ts:37](C:/dev/story-orchestrator/src/runtime/wiring/talk.ts:37).

**Can the party member ask a question immediately after the opening?**

| Authoring approach | What actually happens |
|---|---|
| Narrator `new_chat_only` opener, then companion `afterSpeak` | The opener is a self-injected NPC reply. `afterSpeak` is suppressed while NPC effects are speaking or when the latest message is the self-injection. This is not a dependable attachment point. |
| Two replies both marked `new_chat_only` | Each checks whether the chat is empty. After the first lands, the second no longer qualifies. |
| Narrator `new_chat_only`, then ordinary companion `onEnter` | Can work during activation, provided the narrator’s line does not trigger opener deferral. However, ordinary entry replies run after staging and only on activation; hydration retries the special opener but not ordinary entry replies. |
| Scripted chain `[narrator, companion]` | Controls a normal generated turn. Posting the authored opener does not start that chain. A standalone forced generation also does not open a chain. |
| Companion `kind: "llm"` with “ask the player…” in `instruction` | Currently generates without applying that instruction. |

The controlling code is [effectsApplier.ts:186](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:186), [effectsApplier.ts:250](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:250), [effectsApplier.ts:437](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:437), [effectsApplier.ts:474](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:474), and [talkControl.ts:198](C:/dev/story-orchestrator/src/runtime/talkControl.ts:198).

Thus, **a scripted narrator opener plus a scripted ordinary `onEnter` companion question is a possible authoring workaround**, with zero loud model calls. It does not guarantee correct startup across delayed setup, interrupted activation, reload, and player intervention. If identity settles later, that action requests hydration, which is another reason to test startup separately: [playerSetupControl.ts:31](C:/dev/story-orchestrator/src/runtime/playerSetupControl.ts:31).

For this particular feature, I favor authored text initially. The opening situation is known, and the question’s wording matters. A generated variant can follow once the scheduling contract works.

**The most consequential findings are these.**

1. **Confirmed defect: generated NPC instructions are discarded.**  
   `fireReply` reads `text ?? instruction`, but uses that value only for scripted replies. The generated branch executes `/trigger await=true <position>` without staging the instruction. This directly contradicts the guide’s promise that generated replies follow `instruction`.

   Fix with a temporary, member-specific instruction scoped to one generation, cleared on completion, refusal, cancellation, mutation, or chat change. Verify the actual outgoing prompt, not merely that `/trigger` ran.  
   [effectSteps.ts:66](C:/dev/story-orchestrator/src/runtime/effectSteps.ts:66), [story-guide.md:326](C:/dev/story-orchestrator/docs/authoring/story-guide.md:326)

2. **Question policy conflicts with the desired interaction.**  
   `NO_CLOSING_QUESTION_CLAUSE` forbids endings asking what the player does. It is included in `player_action` objectives and in pacing hints whenever player-action protection is enabled. This does not ban every factual question, but it discourages a central form of invitation.

   Separate agency from prose style. Keep the prohibitions on writing the player’s actions, words, and feelings. Replace the blanket ending rule with role- and beat-specific guidance: avoid repetitive narrator prompts; allow purposeful in-character questions.  
   [agency.ts:32](C:/dev/story-orchestrator/src/engine/agency.ts:32), [steering.ts:24](C:/dev/story-orchestrator/src/pacing/steering.ts:24)

3. **There is no shared budget for everything that speaks.**  
   `chain.max` bounds the talk controller’s chain. NPC effects iterate independently and can add multiple replies. Generated NPC effects also use `/trigger`, whereas chained voices use the newer busy/draft-aware `startVoice` path.

   Consequently, “maximum two responses to this player send” is not currently an end-to-end promise. This is a code-level architectural gap; the exact interleavings need browser reproduction.  
   [talkControl.ts:278](C:/dev/story-orchestrator/src/runtime/talkControl.ts:278), [effectsApplier.ts:484](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:484), [effectSteps.ts:71](C:/dev/story-orchestrator/src/runtime/effectSteps.ts:71)

4. **`stop_on_player` is not a universal yield rule.**  
   Scripted chains select the next sequence entry without consulting hand-back logic. Director chains with pending named addressees prioritize them and withhold the player option. A companion can therefore ask the player a question while another scheduled member still speaks afterward.

   An explicit “this beat yields” should supersede optional reactions and spotlight goals, while retaining genuinely necessary resolution of the player’s submitted action.  
   [talkControl.ts:290](C:/dev/story-orchestrator/src/runtime/talkControl.ts:290), [talkControl.ts:325](C:/dev/story-orchestrator/src/runtime/talkControl.ts:325)

5. **Confirmed eligibility defect: one remaining NPC plus PLAYER is treated as fewer than two choices.**  
   The judge checks candidate count plus optional silence, but does not count `allowHandBack`. With one remaining member and silence disabled, a meaningful member-versus-player decision is skipped. Depending on configuration, this falls through to the text director or ends the chain.  
   [judge.ts:280](C:/dev/story-orchestrator/src/runtime/judge.ts:280), [directorEligible.ts:7](C:/dev/story-orchestrator/src/judge/directorEligible.ts:7)

6. **Player-address detection is too broad for a general yield controller.**  
   Opener deferral treats any question in the last two quoted passages as player-directed; second-person wording also qualifies without resolving its recipient. That can hold an opener because one NPC questioned another. Conversely, an implicit invitation without those markers may be missed.

   Reuse this only as a heuristic. A scheduling decision needs a recipient and an unresolved response obligation, not punctuation alone.  
   [openerDeferral.ts:24](C:/dev/story-orchestrator/src/runtime/openerDeferral.ts:24)

7. **Deferred openers have a rollback gap.**  
   Their persisted state contains a message index but no source revision. Rollback rewinds NPC counts and posted opener records, but does not clear or rebase `deferredOpener`. Deleting earlier messages can leave its answer threshold pointing at the wrong position; editing away the invitation can leave an obsolete hold.

   This is a static defect candidate with a straightforward reproducer: hold an opener, delete a preceding row, then answer.  
   [openerDeferral.ts:4](C:/dev/story-orchestrator/src/runtime/openerDeferral.ts:4), [openerDeferral.ts:54](C:/dev/story-orchestrator/src/runtime/openerDeferral.ts:54), [rollback.ts:102](C:/dev/story-orchestrator/src/runtime/rollback.ts:102)

8. **NPC cadence and identity are less expressive than the guide suggests.**  
   Repeat spacing is a fixed eight **message indexes**, not player turns. Extra party replies therefore change the effective cooldown. Counts are keyed by checkpoint/trigger/member/filtered index and do not reset simply because the checkpoint is re-entered. The filtered index can also collide between separately processed new-chat and ordinary entry replies for the same member.

   Add stable authored reply IDs and explicit scopes such as `once_per: story|entry|player_turn`, with cooldowns measured in player turns.  
   [npcReplyRewind.ts:19](C:/dev/story-orchestrator/src/runtime/npcReplyRewind.ts:19), [effectsApplier.ts:477](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:477), [effectsApplier.ts:490](C:/dev/story-orchestrator/src/runtime/effectsApplier.ts:490)

9. **Selection weights do not provide spotlight rotation.**  
   Weights affect deterministic fallback; the judge receives roles but not weights or a participation history. `no_repeat` prevents repetition within a chain, but does not guarantee that a quiet member gets a meaningful contribution over several player turns. Mention fallback also uses name-word matching; the more precise vocative detector is used elsewhere, not here.  
   [rules.ts:60](C:/dev/story-orchestrator/src/talk/rules.ts:60), [rules.ts:126](C:/dev/story-orchestrator/src/talk/rules.ts:126), [talkControl.ts:472](C:/dev/story-orchestrator/src/runtime/talkControl.ts:472), [directAddress.ts:41](C:/dev/story-orchestrator/src/talk/directAddress.ts:41)

10. **The guide and turn indicator need alignment with current behavior.**  
    The guide describes mention-before-director priority, but the judge is tried before mention fallback. Its statement that unknown scripted voices are skipped does not match the runtime, which ends when the next entry cannot resolve. The “your move” indicator requires an explicit `player` decision; reaching the cap or finishing a script does not produce one.

    Record every end reason—question, cap, script completion, transition, cancellation—and distinguish “waiting for you” from model confidence about whose turn it is.  
    [story-guide.md:386](C:/dev/story-orchestrator/docs/authoring/story-guide.md:386), [talkControl.ts:432](C:/dev/story-orchestrator/src/runtime/talkControl.ts:432), [talkControl.ts:294](C:/dev/story-orchestrator/src/runtime/talkControl.ts:294), [yourMove.ts:30](C:/dev/story-orchestrator/src/runtime/yourMove.ts:30)

`sceneBreak` is also unsuitable as an immediate dialogue timing primitive: its current path depends on the scene-summary work completing before replies fire. Use it for scene reactions, not precise conversational handoffs. [extractionCoordinator.ts:386](C:/dev/story-orchestrator/src/runtime/coordinators/extractionCoordinator.ts:386)

**I would build the additions around one shared scheduler.** Existing patterns to extend are `TalkController`, the guarded `startVoice`, NPC effect accounting, and revision-aware `yourMove`.

Every automatic speaking request should carry its origin, source revision, checkpoint-entry identity, intended recipient, optional instruction, budget reservation, and whether it yields afterward. All paths—including NPC effects—must reserve from the same budget. Count rendered messages and attempted loud generations separately: a failed generation still costs time.

A useful initial budget is **one normal response, at most one justified additional response**, with an independently declared opening sequence. Profile selection can vary this without silently switching built features off. Thinking and inner voice remain enabled.

The following are **proposed schema sketches**, not fields that work today:

| Control | Authoring sketch | Runtime mechanism | Cost, risk, and test |
|---|---|---|---|
| **Opening hook** | `opening: { once: "chat", steps: [{member:"narrator", kind:"scripted", text:"…"}, {member:"companion", kind:"llm", intent:"ask_player", instruction:"…", yield_after:true}] }` | Persist sequence progress; post narration, wait for required staging, then schedule exactly one companion. Complete only when its message lands. Player input cancels the pending continuation. | Scripted pair: **0 loud calls**. Generated companion: **1**. Risk: duplicates or delayed interruption. Test empty chat, delayed identity, reload between steps, failed generation, typing, STOP, and mutation of either message. |
| **Address-the-player beat** | `address_player: { after_player_turns:3, by:"relevant_member", intent:"invite_opinion", cooldown_player_turns:4 }` | Add a member-specific instruction to the next already-budgeted reply. Select relevance first; do not create a second voice merely to satisfy a quota. | Usually **0 additional calls**. Risk: repetitive interviewing or forced intimacy. Test that the question concerns available information and accepts refusal or silence. |
| **Question ending and yield** | `ending: { mode:"in_character_question", recipient:"player", yield:true }` | Typed beat marks an answer opportunity; after rendering, prevent optional follow-ups. For unplanned questions, classify recipient and whether an answer is actually awaited. | **0 additional loud calls**; possibly one existing judge decision. Risk: rhetorical or NPC-directed questions mistaken for invitations. Test quoted speech, multiple recipients, rhetorical questions, and unanswered prior requests. |
| **Quiet-member spotlight** | `spotlight: { window_player_turns:6, max_silent_player_turns:4, relevance_required:true }` | Maintain revision-derived participation history. Give overdue, eligible members priority among meaningful candidates. Replace another optional voice rather than append one. | **0 additional calls** when substituting. Risk: irrelevant contributions and quota-driven dialogue. Test with absent members, direct player address, confidential knowledge, and differing party sizes. |
| **Narrator monologue cap** | `narrator: { max_messages_per_player_turn:1, target_words:140, max_paragraphs:3 }` | Hard scheduling cap on narrator messages; soft prose-length instruction. Measure actual length and feed misses into later direction. | Usually saves calls and tokens. Risk: losing necessary action resolution. Test long descriptions and complex attempts. Do not truncate mid-sentence or reduce thinking to enforce a prose target. |
| **Reaction beat** | `reactions: { when:"consequence", max:1, intent:"brief_reaction", yield_after:true }` | Queue one relevant reaction only if it adds information or character perspective, the budget remains, and the player is not already owed the floor. | **0–1 additional loud call**. Short output still incurs prefill and thinking. Risk: repetitive agreement or premature escalation. Test redundant reactions, transitions, STOP, and mutation of the triggering consequence. |
| **Idle nudge** | `idle: { after_seconds:90, mode:"offer", max_per_player_turn:1 }` | Show a small invitation to continue; generate only on the player’s request. No automatic story advancement from wall-clock inactivity. | Idle UI: **0 calls**; accepted nudge: **1 budgeted call**. Risk: interrupting reading or treating absence as consent. Test typing, unfocused tab, paused generation, and reload. |
| **Checkpoint pacing profile** | `talk_control: { profile:"decision", budget:{max_generated:2}, overrides:{…} }` | Resolve story defaults plus checkpoint overrides into one explicit policy. Profiles might be opening, conversation, decision, action, and aftermath. Keep conversational pace separate from tension. | **0 calls** for resolution. Risk: opaque combinations. Test precedence, transitions mid-chain, and a visible author preview of effective policy. |
| **Judge: is it the player’s turn?** | `yield: { mode:"judge", on_uncertain:"stop_optional" }` | Extend the existing director response with `floor: player|member`, recipient, and a reason such as unresolved question or necessary world response. Apply deterministic budgets and explicit yield before asking. | Aim for **no extra request** beyond the current next-speaker decision. Risk: judging every reply adds latency; false yielding leaves actions unresolved. Test both errors and outages, including the one-candidate case. |

For rollback, avoid bare counters disconnected from messages. Derive spotlight and word totals from retained, revision-stamped events. Invalidate pending beats when any source revision changes. Keep seeded tie-breaking keyed to a stable opportunity identity, so retries and replay do not create fresh lottery tickets.

Also preserve a useful distinction already implicit in NPC rewind behavior: **an authored line that survives an edit should not be duplicated**, but a semantic claim such as “the player is still being asked a question” must be re-evaluated against the edited text.

**Evaluation should measure invitation, responsiveness, and waiting cost together.** Optimizing question rate alone would produce an exhausting interview.

Start with synthetic English fixtures, covering opening, conversation, decision, action, and aftermath. Include two-, three-, and five-member groups; absent members; unnamed address; multiple addressees; and player refusal.

Use three stages:

1. **Deterministic scheduler checks first.** No model needed for budget enforcement, ownership, ordering, seeded selection, and rollback. Include interrupted startup and overlapping NPC/chain requests.
2. **Blind transcript pilot.** Eight fixtures × two seeds × two conditions gives 16 paired comparisons. Compare current behavior against the focused candidate. Extend four fixtures for four player turns to measure repetition and spotlight. Use matched player intentions, model/preset, context limits, and thinking settings; do not assume the same seed produces identical prose after prompts differ.
3. **Real browser confirmation on an authorized lane.** Verify actual payloads, message order, cancellations, and total model calls. A mock can prove the scheduler respects a decision; it cannot prove Artemis asks a good question.

Randomize A/B order and hide configuration labels. Rate naturalness, invitation to participate, character specificity, agency, and unwanted continuation on a five-point scale. Separately show timing measurements for responsiveness ratings. Use independent raters; do not make the operating talk judge its own sole evaluator.

These are proposed floors to freeze **before** the run:

| Measure | Proposed floor or ceiling |
|---|---|
| Opening speaker order and exactly-once scheduling | **100%** of deterministic cases |
| First companion address on opening | By assistant message **2**, before player send **1**, in **≥95%** of uninterrupted generated openings |
| Opening question quality | **≥90%** clearly directed to the player, context-specific, and answerable |
| Yield after a designated player question | **≥95%** stop immediately; **100%** for explicit scripted yield |
| False yield | **≤5%** of cases still needing a necessary world response |
| Authored question-beat fulfillment | **≥90%**; report overall question rate by profile rather than maximizing it |
| Agency | **0 observed** invented player decisions, speech, or settled feelings; report sample size |
| Shared generation budget | **100%** compliance, including NPC effects |
| Monologue | Narrator message cap **100%**; **≥90%** within the authored soft prose bound |
| Spotlight | **≥90%** of relevant, continuously eligible members contribute within four player turns |
| Blind quality | Median **≥4/5** for invitation and naturalness; candidate preference **≥60%** |
| Cost | Ordinary turns average **≤1.5 loud generations**; report attempts, retries, tokens, and GPU time |
| Latency | No more than **10% regression** in p95 time to player floor on matched fixtures |
| Mutation correctness | **100%** deterministic rollback/replay checks; zero stale pending beat landings in live cases |

“Member share” should report both message share and word share, excluding narrator and absent-member time where appropriate. Equal shares are not the objective: an addressed companion should dominate a conversation when that makes sense.

Report uncertainty and failures, retain first-attempt results, and treat this small pilot as screening evidence. Floors remain informational; a miss should not silently disable a feature or lead to moving the floor.

My ranked list is:

1. **Repair generated NPC instructions and separate question style from agency protection.**
2. **Create one shared speech budget and guarded scheduler for chains and NPC effects.**
3. **Add a persisted opening sequence: narrator → one companion invitation → player.**
4. **Make explicit yield work across scripted chains, director chains, and effects.**
5. **Fix deferred-opener rollback, stable NPC IDs, and one-candidate judge eligibility.**
6. **Add per-checkpoint profiles with narrator message caps and soft prose targets.**
7. **Add relevant address-the-player beats, preferably within an existing reply.**
8. **Add spotlight rotation that substitutes voices instead of increasing generation count.**
9. **Improve judge hand-back classification and record every chain-ending reason.**
10. **Add tightly budgeted reaction beats; leave automatic idle speech last and prefer a zero-cost nudge.**