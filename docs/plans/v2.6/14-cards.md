<!-- Generated from test/sessions/charters.json by `node scripts/debug/so-session.mts cards --write`. Do not edit by hand. -->

# Plan 14 charter cards

Pinned Adolion build `e1c91fbebb47e22045c32932e750ef2f90cb015c`. 36 cards. Start one with `node scripts/debug/so-session.mts start <id> --lane <n>`.

## T0

### T0-1 First contact

- **Question:** Can a player who has never seen the extension find the adventurer story through the entry points and play 20 turns with the story visibly keeping up?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Persona: Any adventurer persona (a fresh D-rank signing on at the Guild in Aegis City).
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
  - Do not open the drawer's Author view in this session.
  - adolion-fresh binds every Adolion group to its story, so the fresh chat already plays it: open the Extensions panel and read Start / Continue / Repair as a new player would before the first turn.
- **Drive:**
  1. **Read the entry points**, aims at The Guild Hall `guild-hall`. In the settings panel, check that Continue names The Adventurer's Road, the requirements read ready and Repair has nothing to say; open Start to see how you would pick another story.
     - Sample line: "(no chat line: this beat is the settings panel)"
  2. **Look around the hall**, aims at The Guild Hall `guild-hall`. Talk to Tobias at the counter and let Belle and Dalan react.
     - Sample line: "What's on the board that pays and won't get us killed?"
     - Sample line: "Tobias, what's the catch with the Wendhope posting?"
  3. **Take Wendhope and name the party**, aims at The Road North `road-to-wendhope`. The gate needs path = wendhope and a party name in Ellie's book.
     - Sample line: "We'll take the Wendhope job."
     - Sample line: "Put us down as the Ash Lanterns."
  4. **Travel north**, aims at On the Road `on-the-road` or Hold, Wendhope Is Closed `at-the-walls`. Two days of empty road, then Wendhope's closed gate.
     - Sample line: "We keep moving north. Anyone else notice there's no traffic on this road?"
     - Sample line: "We make camp by the carriages and keep a watch."
- **Look for:**
  - The entry points tell you, without any docs, which story this chat plays and that it is ready. *(settings panel)*
  - The HUD shows The Guild Hall, then The Road North after you take the job and give a name. *(HUD)*
  - The Overview's 'where you are' uses checkpoint names and plain language, no ids. *(Overview)*
  - A small chip under the transition reply says a new scene started. *(timeline)*
  - Tobias drops out of the scene once you leave the hall (cast change). *(chat)*
- **Must not happen** (press the flag at once):
  - The narrator decides for you that the party takes the job, packs or leaves town.
  - The story reaches The Road North before a party name has been said.
  - Ids like guild-hall, road-to-wendhope, party_name or path appear anywhere in player mode.
  - Vallie mentions that she signed off the Wendhope fee and thinks the Sheridans hide something, unprompted (it is in the guidance's 'Who knows what').
  - Ellie's private matchmaking ledger is read out or quoted by anyone.
  - A reply arrives with nothing from the story side updating for more than 5 turns (HUD frozen).
- **Provocations:**
  - Ask the narrator what you should do.
  - Reload the page once mid-session and continue.
- **Flag when:**
  - You did not understand what a panel was telling you.
  - A reply felt slow or repeated itself.
  - Anything looked broken or unfinished.
- **Stop when:** 20 player turns, or you reach Hold, Wendhope Is Closed; about 40 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - entry points: could you start without help?
  - requirements readout
  - HUD
  - Overview
  - transition timing
  - timeline at level 1
- **Logged automatically:**
  - every extraction read with its prompt, raw reply and rejected lines (journal.jsonl)
  - every boundary and transition with the gate that fired
  - every generation request with the drafted member (payloads.jsonl)
  - judge calls, saves and extension console errors
- **Known limits:**
  - Images and sprites are off.
  - The inner voice is off by default.
  - The chat note on transitions is on by default until W11 decides.

### T0-2 Come back

- **Question:** After a reload and a day away, does the T0-1 chat reopen exactly where it was, with a recap that helps and no Repair row?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); continues the T0-1 chat; player mode.
  - Persona: The same persona you used in T0-1.
  - Settings: images off; sprites off.
  - Best started the day after T0-1, so the away recap has a real gap to cover.
  - so-session start reopens the T0-1 chat on the same lane without re-seeding.
- **Drive:**
  1. **Read the welcome back**, aims at Hold, Wendhope Is Closed `at-the-walls` or The Road North `road-to-wendhope`. Before typing, read the away recap and the Overview.
     - Sample line: "(read first, then:) So where were we?"
  2. **Get inside Wendhope**, aims at Hold, Wendhope Is Closed `at-the-walls` or The Red Fog `first-night`. Grod refuses the gate; sundown is the clock. The Guild seal, the contract, supplies or healing all work.
     - Sample line: "We're from the Guild, the Sheridans sent us. Let us in before the sun's gone."
     - Sample line: "We have bandages for your wounded. Open the gate."
  3. **Reload once more mid-scene**, aims at The Red Fog `first-night` or Outside at Sundown `outside-at-sundown`. Reload the page, reopen the chat, continue 10 turns.
     - Sample line: "We hold the wall. Belle, left side. Dalan, find the ones in the fog."
- **Look for:**
  - The away recap names where you are and what happened, in story words. *(popup)*
  - The HUD checkpoint and tension match where T0-1 ended. *(HUD)*
  - No Repair row appears in the settings panel after either reload. *(settings panel)*
  - The first night brings the red fog and the Screechers, with a chip under the transition. *(timeline)*
- **Must not happen** (press the flag at once):
  - The story restarts at The Guild Hall or loses the party name.
  - The recap mentions ids, boundaries or quality names.
  - The archers name the red fog to strangers before the party is inside or has seen it (it is in 'Who knows what').
  - A Repair row or a 'needs setup' chip appears without you touching any setting.
  - The narrator writes your character's choice at the gate for you.
- **Provocations:**
  - Answer the recap popup by closing it immediately, then ask the narrator for a summary.
- **Flag when:**
  - The recap got something wrong or felt too long.
  - Anything reset, even a small thing like tension.
- **Stop when:** 10 turns after the second reload, or you are inside Wendhope; about 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - away recap
  - state restored after reload
  - Repair (should stay silent)
  - transition timing
- **Logged automatically:**
  - the journal across both reloads (the tail re-attaches by itself)
  - save outcomes and read-backs
  - the run header at start and stop
- **Known limits:**
  - The recap only appears after a real gap; a same-day session may not show it (then flag 'no recap').
  - Images and sprites are off.

### T0-3 First slips

- **Question:** When the player swipes, edits, deletes or regenerates, does the story undo exactly what was undone and nothing more?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Persona: Any adventurer persona.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Take the job, then swipe the reply**, aims at The Road North `road-to-wendhope`. Commit to Wendhope with a party name, then swipe the reply that moved the story.
     - Sample line: "We take Wendhope. Write us down as the Ash Lanterns."
  2. **Edit your own line**, aims at The Guild Hall `guild-hall` or The Road North `road-to-wendhope`. Edit your accepting line into a refusal, then regenerate the reply.
     - Sample line: "(edit to:) Actually, no. Not for that money."
  3. **Delete the last reply**, aims at The Road North `road-to-wendhope` or On the Road `on-the-road`. Accept again, travel one turn, then delete the last reply.
     - Sample line: "Fine, we'll do it. Ash Lanterns. Let's ride north."
  4. **Regenerate at a quiet moment**, aims at On the Road `on-the-road` or Hold, Wendhope Is Closed `at-the-walls`. Regenerate a travel reply twice; nothing should move.
     - Sample line: "We camp by the abandoned carriages."
- **Look for:**
  - After the swipe the HUD goes back to The Guild Hall until the new reply earns the move again. *(HUD)*
  - A short 'the story stepped back' notice appears when an edit undoes a transition. *(Overview)*
  - Timeline chips of a deleted or swiped reply disappear with it. *(timeline)*
  - Party name and path in the story match the text that survives. *(Overview)*
- **Must not happen** (press the flag at once):
  - The story stays on The Road North after your acceptance was edited into a refusal.
  - The story rewinds further back than the message you changed.
  - A deleted reply's facts or chips remain.
  - Any message in the chat disappears that you did not delete.
- **Provocations:**
  - Swipe right after a transition, then swipe back to the first version.
  - Delete two messages in a row.
- **Flag when:**
  - Anything moved that you did not touch.
  - The step-back notice was confusing or missing.
- **Stop when:** All four slips tried at least once; about 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - rollback on swipe
  - rollback on edit
  - rollback on delete
  - step-back notice
  - timeline follows mutations
- **Logged automatically:**
  - boundaries and rollbacks (a boundary that goes back is logged)
  - every extraction read, so a stale read after an edit is visible
  - save outcomes
- **Known limits:**
  - Images and sprites are off.
  - Swiping a greeting is not a meaningful slip (nothing has been read yet).

## T1

### T1-1 Follow the hook

- **Question:** Played cooperatively, does the adventurer story move through its checkpoints from play alone, on time, without narrating the player?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Persona: An adventurer who says yes to the job.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Take the Wendhope posting**, aims at The Road North `road-to-wendhope`. path = wendhope plus a party name.
     - Sample line: "We'll take Wendhope."
     - Sample line: "Call us the Grey Pennants."
  2. **Reach the walls**, aims at On the Road `on-the-road` or Hold, Wendhope Is Closed `at-the-walls`. reached_walls; notice what the road is missing.
     - Sample line: "We push on to the village before dark."
  3. **Get inside before sundown**, aims at The Red Fog `first-night` or Outside at Sundown `outside-at-sundown`. inside_wendhope, or the clock runs out.
     - Sample line: "Here's the Guild seal and the Sheridan contract. Open up."
  4. **Hold the wall**, aims at What Wendhope Knows `what-wendhope-knows` or The Wall Breaks `the-breach`. survived_first_night at dawn.
     - Sample line: "Belle, the ladder! Dalan, keep shooting into the fog."
  5. **Investigate**, aims at Into Needlehaven `into-needlehaven`. Talk to Duggy, Halena, Qinne and Ol' Nan; one clue per real effort.
     - Sample line: "Duggy, what did your miners find the week before the fog?"
- **Look for:**
  - Each move lands within a few turns of the moment it earns (HUD changes then, not later). *(HUD)*
  - Belle and Dalan each get moments; Tobias does not speak after the hall. *(chat)*
  - Tension rises into the first night and falls at dawn. *(HUD)*
  - The Overview's threads list what is still open (the fog, the mine). *(Overview)*
- **Must not happen** (press the flag at once):
  - The narrator writes what your character says or decides.
  - A checkpoint jumps ahead before its event happened (for example What Wendhope Knows before dawn).
  - Duggy admits the mine broke into the pale roots before he is shown it (guidance 'Who knows what').
  - Qinne mentions the alabaster cut that will not close unprompted.
  - Dalan volunteers that the alabaster is living wood before anyone asks him.
- **Provocations:**
  - Stay in the hall two extra turns chatting before accepting.
  - Go silent for one turn (send only an action like 'I wait.').
- **Flag when:**
  - A move felt late or early.
  - The story stalled with nothing for you to do.
  - A character knew something they should not.
- **Stop when:** You are in Into Needlehaven, or after 60 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - transition timing
  - agency (never narrates you)
  - speaker direction
  - pacing / tension
  - secrets kept
- **Logged automatically:**
  - every extraction read and the qualities it wrote (path, party_name, reached_walls, inside_wendhope, evidence)
  - talk decisions
  - prompts sent
  - judge calls
- **Known limits:**
  - Images and sprites are off.
  - The inner voice is off by default.

### T1-2 Refuse the hook

- **Question:** When the player says no to the story's offer, does the story answer the refusal without forcing or narrating compliance?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Persona: An adventurer who does not want the Wendhope job.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
  - The steward (the-sheridan-steward) is The Guild Hall's authored alternate: in this build it is reached only when an author takes it from the Driver panel, not by a gate. Expect a neutral answer in player mode; switch Author view on only in beat 3 if the story holds.
- **Drive:**
  1. **Look around the hall**, aims at The Guild Hall `guild-hall`. Let Tobias pitch the Wendhope posting.
     - Sample line: "What's the job on the board with the red seal?"
  2. **Refuse it clearly**, aims at The Guild Hall `guild-hall`. The refusal should get one neutral, in-world answer and no forced departure.
     - Sample line: "A collapsed mine shaft for that pay? No. We'll find something else."
  3. **Refuse again, differently**, aims at Who Is Looking for a Party `adv-guild-tavern` or The Sheridan Steward `the-sheridan-steward`. Stall, bargain, or walk out to the tavern (adv_looking_for_hands). If the story just holds, turn Author view on and take the alternate from the Driver panel.
     - Sample line: "Tell the Sheridans to hire soldiers."
     - Sample line: "We'll be in the tavern if anyone has a real job."
  4. **Accept on your own terms, and name the party**, aims at The Road North `road-to-wendhope`. path = wendhope and a party name.
     - Sample line: "Fine. Triple the fee, and we ride as the Ash Lanterns."
- **Look for:**
  - Each refusal gets exactly one neutral in-world answer. *(chat)*
  - The HUD changes only when you walk to the tavern or finally accept. *(HUD)*
  - The timeline chip under a transition reply says a new scene started, with no internals. *(timeline)*
  - Belle and Dalan voice their own opinions about the money. *(chat)*
  - If you take the alternate: the steward's new detail (the lost caravan and riders) appears only then. *(chat)*
- **Must not happen** (press the flag at once):
  - The narrator writes your character agreeing, packing or leaving town.
  - The story jumps to The Road North without a party name.
  - The steward's suspicion about the Baron shows up in anyone's mouth unprompted ('Who knows what'; that leak is C13).
  - Rydel mentions the north road's missing traffic before Wendhope comes up (tavern 'Who knows what').
  - Ids like the-sheridan-steward or adv_looking_for_hands are visible anywhere in player mode.
- **Provocations:**
  - Answer with an ambiguous 'maybe'.
  - Say nothing meaningful for two turns.
  - Swipe the reply to your first refusal once.
- **Flag when:**
  - A refusal was ignored, or answered twice.
  - The pressure felt heavy-handed.
  - The party name you gave is wrong later.
- **Stop when:** You are on the road with a named party, or after 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - agency (refusal handling)
  - transition timing
  - speaker direction
  - timeline at level 1
  - HUD
- **Logged automatically:**
  - every extraction read (did it see the no?)
  - blackboard path / party_name / adv_looking_for_hands writes
  - talk decisions
  - the prompts sent
- **Known limits:**
  - Images and sprites are off.
  - The inner voice is off by default.
  - The Guild Hall has no gated edge to the steward (the other eight stories gate their refusal alternate on a quality); if the steward never comes in player mode, that is a candidate finding, not a mistake in play.

### T1-3 Group direction

- **Question:** In a crowded war council, does the right character answer when you address one by name, and does someone sensible answer when you address nobody?
- **Setup:**
  - Story: `adolion-war` (Adolion: Fire and War); fresh chat; player mode.
  - Persona: The Nightriver heir leading a C-rank party at the King's council.
  - Starts at The King's War Council `war-the-summons`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Talk to one person by name**, aims at The King's War Council `war-the-summons`. Speakers here: Narrator, Alexander, Forre, Haley, Vallie, Belle, Dalan.
     - Sample line: "Princess Haley, do you believe the rumour about your mother?"
     - Sample line: "Guildmaster, what is the Crown really asking of adventurers?"
  2. **Talk to nobody in particular**, aims at The King's War Council `war-the-summons`. An open question to the room; the narrator or the King should take it.
     - Sample line: "So who is burning the villages behind the line?"
  3. **Take or refuse the commission**, aims at Fort Vicinitas `war-the-front` or The Queen's Wing `war-the-queens-wing`. war_commission_taken (and war_reached_front) or war_commission_refused.
     - Sample line: "We take the King's commission. Point us at the front."
     - Sample line: "No. We won't be a forlorn hope for the Crown."
  4. **At the front, address Kanna at the parley**, aims at Fort Vicinitas `war-the-front` or Behind the Lines `war-behind-the-lines` or Renfath `war-the-pits`. A new speaker joins the scene; she should get the floor when addressed.
     - Sample line: "Blood Saint, why do you care where the dead go?"
- **Look for:**
  - The character you name answers first in at least 4 of 5 addressed turns. *(chat)*
  - Nobody outside the scene (Melisande before the Queen's Wing, Kanna before the front) speaks. *(chat)*
  - Replies do not stack three characters saying the same thing. *(chat)*
  - The HUD moves to The Queen's Wing or Fort Vicinitas when you commit. *(HUD)*
- **Must not happen** (press the flag at once):
  - The wrong member answers a direct question to someone present.
  - Haley says outright that her mother never touched necromancy in open council before she is pressed ('Who knows what').
  - Vallie tells a party that did not ask her that the Crown will spend them as a forlorn hope.
  - Forre admits he lets the rumour stand to weaken Haley's backers, unprompted.
  - A character speaks for your persona.
- **Provocations:**
  - Address two people in one line.
  - Ask a question and then say 'never mind'.
  - Name a character who is not in the scene (Melisande).
- **Flag when:**
  - The speaker choice felt wrong, even once.
  - Silence when someone should have answered.
- **Stop when:** 10 addressed turns at the council plus 5 at the front, or 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - speaker direction (named)
  - speaker direction (open questions)
  - cast changes
  - secrets kept
- **Logged automatically:**
  - every talk decision with its source (rules, director, judge) and latency
  - judge director calls and fallbacks
  - cast changes per checkpoint
- **Known limits:**
  - Most muster checkpoints need qualities from earlier stories (ritual_stopped, deep_partner, night_pact...); a fresh war chat goes straight from the council to the front.
  - Images and sprites are off.

### T1-4 Effects

- **Question:** Does each checkpoint change the stage it should: background, author's note, lore that appears and disappears, cast that joins and leaves?
- **Setup:**
  - Story: `adolion-east` (Adolion: The Eastern Road); fresh chat; player mode.
  - Persona: The leader of a C-rank Guild party arriving in Hianxo.
  - Starts at Landfall at Hianxo `east-landfall`.
  - Settings: timeline level 2; images off; sprites off.
- **Drive:**
  1. **Come ashore**, aims at Landfall at Hianxo `east-landfall`. Honami, Belle and Dalan only; the harbour background.
     - Sample line: "Honami, who asked for us, and why us?"
  2. **Go to the Academy**, aims at Jiansho Academy `east-jiansho-academy`. east_at_academy; Megumi joins.
     - Sample line: "Take us to Jiansho Academy."
  3. **Sign the register**, aims at The Opening Rounds `east-the-rounds`. east_entered; Hanzo joins as a steward.
     - Sample line: "We sign under Honami's name. Where do we fight?"
  4. **Win through, then find the Hattaxi**, aims at The Hattaxi Shadow `east-the-hattaxi-shadow` or The Upset `east-the-upset`. east_through_rounds; Tanya and Rikako join, Megumi leaves.
     - Sample line: "We fight the monks next. Dalan, watch the ward posts."
  5. **The final**, aims at The Final Before the Emperor `east-the-final`. east_plot_known or east_final_called.
     - Sample line: "There's a thread between the ward posts. Honami, can you read the charm on it?"
- **Look for:**
  - The chat background changes at the Academy and at the arena. *(chat)*
  - Characters listed as joining can be addressed; the ones who left do not speak. *(chat)*
  - At level 2 the timeline shows lore and cast chips under the transition replies, in player words. *(timeline)*
  - The Overview's 'where you are' matches the background. *(Overview)*
- **Must not happen** (press the flag at once):
  - Megumi speaks after The Hattaxi Shadow removed her from the scene.
  - Lore from a later checkpoint (Rikako's thread, Talxo as target) reaches a reply before its checkpoint ('Who knows what': nobody knows Talxo is marked).
  - Honami tells the party about her father's marriage threat before a refusal or a real reason ('Who knows what').
  - A background or cast change happens with no checkpoint change.
  - Gated lorebook entry names show up in player mode.
- **Provocations:**
  - Swipe the reply right after a transition and watch the background.
  - Reload during the Academy scene.
- **Flag when:**
  - An effect lagged by more than one reply.
  - Someone who left came back.
- **Stop when:** You reach The Final Before the Emperor, or 60 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - backgrounds
  - cast joins and leaves
  - checkpoint lore
  - timeline at level 2
  - Overview
- **Logged automatically:**
  - World Info activations per reply (lore fired) and lore-force-lost / lore-constant-missed flags
  - effect ledger entries (background, cast)
  - prompts sent
- **Known limits:**
  - Images and sprites are off.
  - The level-2 timeline is 'behind the scenes'; levels 3-4 are T3-2.

### T1-5 Off the map

- **Question:** When the player goes where the story did not author, do the generated stretches carry the story to its next authored place without breaking it?
- **Setup:**
  - Story: `adolion-night` (Adolion: Night Courts); fresh chat; player mode.
  - Persona: The leader of a C-rank Guild party following the Heresy out of Aegis City.
  - Starts at The Fog at Kelger Falls `night-the-kelger-falls`, seeded by `so-session start`.
  - Settings: images off; sprites off.
  - Seeded at The Fog at Kelger Falls so the generated Long Night stretch is close. Kayla and Erevan travel with the party.
- **Drive:**
  1. **Break the fog your own way**, aims at The Fog at Kelger Falls `night-the-kelger-falls` or The Long Night `night-the-long-night`. night_fog_broken; the sea to the south is the one way untried.
     - Sample line: "We take a boat south, into the sea."
     - Sample line: "Zariah, lay them down. Kayla can help if you let her."
  2. **Wander the long night**, aims at The Long Night `night-the-long-night`. An unauthored road: whatever the long night holds is generated.
     - Sample line: "We leave the road and follow the river instead."
     - Sample line: "We stop at a village nobody has heard of and ask about the black castle."
  3. **Push somewhere the story never mentions**, aims at The Long Night `night-the-long-night`. Try a detour that is not in any checkpoint.
     - Sample line: "We turn back toward Aegis City for a week to resupply."
  4. **Let it bring you to the castle**, aims at Castle Dracul `night-the-castle-dracul`. night_castle_sighted, or the generated route's progress.
     - Sample line: "We ride toward the castle under the endless night."
- **Look for:**
  - The long night feels like real scenes, not filler, and ends at Castle Dracul. *(chat)*
  - The Overview says where you are in story words during the generated stretch. *(Overview)*
  - The HUD never shows a raw generated id. *(HUD)*
  - A detour is answered in-world without a hard wall. *(chat)*
- **Must not happen** (press the flag at once):
  - The story jumps to Castle Dracul without the party travelling there.
  - The narrator walks your character back onto the road you left.
  - Zariah admits she killed the town before she is pressed ('Who knows what').
  - Cassius or Camilla, or the Heresy's source, appear before the castle.
  - Generated route ids or 'beat' names appear in player mode.
- **Provocations:**
  - Refuse to go to the castle for three turns.
  - Ask the narrator to 'skip to the castle'.
- **Flag when:**
  - A generated scene contradicted an earlier one.
  - The story felt lost or looping.
- **Stop when:** You arrive at Castle Dracul, or 60 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - generated routes
  - detour handling
  - agency
  - Overview during generated play
- **Logged automatically:**
  - expansion generation, critic and insertion (journal)
  - every transition, including generated routes (not an authored edge = logged)
  - judge lookahead calls
- **Known limits:**
  - The seed skipped the first half of the story (the slums, Glasnoa, Thornwood).
  - Images and sprites are off.

### T1-6 Pacing

- **Question:** Does tension follow play: staying low through a slow, talky stretch and climbing when the player rushes?
- **Setup:**
  - Story: `adolion-esha` (Adolion: Eshalanore); fresh chat; player mode.
  - Persona: The leader of a C-rank party sent north to bring the Holt siblings home.
  - Starts at The Last Chapel `esha-the-last-chapel`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Linger at the chapel**, aims at The Last Chapel `esha-the-last-chapel`. Slow and talky: Ashliel, Sali, the pews, the night.
     - Sample line: "Ashliel, why do you want us to turn back?"
     - Sample line: "Sali, what are you? Sit with us."
  2. **Cross the stones carefully**, aims at The Shrine Stones `esha-the-guardians`. esha_at_border; dread built on stillness.
     - Sample line: "We cross the shrine stones, slowly, weapons down."
  3. **Talk through the welcome**, aims at The Welcome of Eshalanore `esha-the-court` or The Road In `esha-the-road-in` or Guests in Rope `esha-bound-and-led`. Long feast conversation; nothing forced.
     - Sample line: "King Teranora, where are the Holt siblings?"
  4. **Rush**, aims at The Empty Bed `esha-the-empty-bed` or The Green Knight `esha-the-green-knight`. When Belle is gone, move fast: short urgent turns.
     - Sample line: "Where is she? Search the wing. Now."
     - Sample line: "We go to the Thornway. Out of the way."
- **Look for:**
  - The tension indicator stays low at the chapel and rises at the stones and after the empty bed. *(HUD)*
  - Replies get shorter and sharper when you rush. *(chat)*
  - No transition happens while you only talk at the chapel. *(HUD)*
- **Must not happen** (press the flag at once):
  - The story forces you across the stones while you are still talking at the chapel.
  - Ashliel tells the Lady's war story or who she was before she is pressed ('Who knows what').
  - Elowyn's drugging of Belle is revealed before the empty-bed search earns it ('Who knows what').
  - The scouts say humans are never allowed to leave ('Who knows what').
  - Tension jumps to peak during a calm conversation.
- **Provocations:**
  - Go silent for two turns at the feast.
  - Rush at the chapel for one turn, then go back to slow.
- **Flag when:**
  - Tension felt wrong for what was happening.
  - A slow stretch was cut short by the story.
- **Stop when:** You reach The Green Knight, or 50 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - tension follows play
  - pacing hint (does the story wait?)
  - HUD tension readout
  - secrets kept
- **Logged automatically:**
  - tension history per reply and the expected tension
  - every transition and its timing
  - prompts sent (the pacing hint is in them)
- **Known limits:**
  - Images and sprites are off.
  - The tension readout is coarse on purpose.

### T1-7 Second story

- **Question:** After playing one story, does a different story in a fresh chat start clean, with nothing carried over?
- **Setup:**
  - Story: `adolion-aegis` (Adolion: Between the Roads); fresh chat; player mode.
  - Also open: a fresh `adolion-adventurer` chat (Adolion: The Adventurer's Road).
  - Persona: The leader of a D-rank party back in Aegis City.
  - Starts at Homecoming `aegis-homecoming`.
  - Settings: images off; sprites off.
  - so-session start opens a fresh adventurer chat first, then this one. Play 5 turns in the adventurer chat before starting here.
- **Drive:**
  1. **Play the adventurer chat first**, aims at Homecoming `aegis-homecoming`. Switch to the adventurer chat, take Wendhope, name the party, then come back here.
     - Sample line: "(in the adventurer chat:) We take Wendhope as the Iron Kettles."
  2. **Enter the exam**, aims at The Guild Tavern `aegis-the-tavern` or Tobias Asks Once `aegis-tobias-pleads`. aegis_exam_entered (or declined).
     - Sample line: "Put our names down for the C-rank exam."
  3. **Go out into the city**, aims at Market Street `aegis-market-street`. aegis_out_in_city.
     - Sample line: "We head to the Market District in the morning."
  4. **Answer the rivals**, aims at Errands `aegis-errands` or Aegis Delights and Curios `aegis-the-curio-shop`. aegis_rivals_answered or aegis_gear_needed.
     - Sample line: "Grant, you're on. Loser buys the drinks."
- **Look for:**
  - The HUD, Overview and Memory tab show only this story. *(Overview)*
  - The Memory tab starts empty here, with none of the adventurer chat's facts. *(Memory tab)*
  - Nobody mentions Wendhope or the party name from the other chat. *(chat)*
  - Switching back to the adventurer chat shows that story, unchanged. *(HUD)*
- **Must not happen** (press the flag at once):
  - The party name, checkpoint or facts from the adventurer chat appear here.
  - Lore from the adventurer's checkpoints (the Guild Hall's posting board, Wendhope) is injected here.
  - Kaian's spy past or Jasira's passed-over story is told unprompted ('Who knows what').
  - Grant's orphanage beds come up before anyone asks ('Who knows what').
- **Provocations:**
  - Switch between the two chats mid-reply once.
  - Mention Wendhope yourself and see who reacts.
- **Flag when:**
  - Anything from the other chat showed up.
  - Switching chats felt slow or lost state.
- **Stop when:** You reach Aegis Delights and Curios, or 40 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - story isolation
  - chat switching
  - Memory tab
  - transition timing
- **Logged automatically:**
  - the journal of both chats (the tail follows chat switches)
  - World Info activations per reply
  - save outcomes on every switch
- **Known limits:**
  - Both stories share the global lorebook selection by design; checkpoint lore must still follow the open chat.
  - Images and sprites are off.

## T2

### T2-1 Long run

- **Question:** Across 80+ turns and one act change, do established facts hold and do the chapter record and the story so far read right?
- **Setup:**
  - Story: `adolion-saga` (Adolion: The Saga); fresh chat; player mode.
  - Persona: The Nightriver heir leading the adventurer party (the Saga's lead).
  - Starts at Driftmere `driftmere`, seeded by `so-session start`.
  - Settings: images off; sprites off; chapters: seal on, storySoFar on, recap on.
  - Seeded at Driftmere so the Driftmere act ends and the Nightriver act begins inside the session.
  - This chat is continued by T2-3 and T2-5: do not delete it.
- **Drive:**
  1. **Hear Driftmere out**, aims at Driftmere `driftmere` or The First Descent `the-first-descent`. Serenola, the survivor at the Minotaur's Tusk, Naomi; then entered_mines.
     - Sample line: "Baroness, what did the last expedition find?"
     - Sample line: "Naomi, you want a fight? Come down with us."
  2. **Go down the mines**, aims at Between the Floors `between-the-floors` or The Changed Deep `the-changed-deep`. descent climbs floor by floor; Naomi comes along.
     - Sample line: "We go down. Naomi, stay close, call your attacks."
  3. **Learn the Devourer's name**, aims at The Sealed Wall `the-sealed-wall`. descent >= 4 and knows_devourer; Riyo joins on the way.
     - Sample line: "Riyo, what are you doing down here alone?"
     - Sample line: "The carvings say 'ascension'. Who ascends?"
  4. **Choose at the seal and end it**, aims at The God-Eater `the-devourer` or Filwern Freed `filwern-freed` or The Wards Hold `the-wards-hold`. past_the_seal, then devourer_outcome slain or resealed.
     - Sample line: "We make an offering here instead of breaking the seal."
     - Sample line: "We kill it. Free what's left of Filwern."
  5. **Climb out and tell Driftmere**, aims at What Filwern Left `what-filwern-left`. back_in_driftmere.
     - Sample line: "We climb for the lifts and go find Serenola."
  6. **Go home to Nightriver**, aims at Home to Nightriver `nightriver-house` or Father's Summons `fathers-summons`. saga_called_home: the act change.
     - Sample line: "A letter from home? Then we go to Aegis City, to the estate."
- **Look for:**
  - At the act change a chapter is sealed and 'Previously...' reads right. *(popup)*
  - Facts from the mines (Riyo's arm, the seal, the outcome you chose) are still in the Memory tab after the act change. *(Memory tab)*
  - Chapter titles in the Overview name what really happened. *(Overview)*
  - Characters remember your choice at the Devourer in the Nightriver act. *(chat)*
- **Must not happen** (press the flag at once):
  - A fact you established is contradicted later (who died, what you chose at the seal).
  - Riyo reveals her demon arm or Figaro's voice without being pressed ('Who knows what').
  - Every Floor Boss names the Devourer unbeaten ('Who knows what').
  - Serenola tells outsiders her letters to the Nightrivers were ignored on purpose, unprompted.
  - The chapter record invents an event that did not happen.
- **Provocations:**
  - Ask a companion about something from 40 turns ago.
  - Leave the chat idle for 20 minutes mid-session, then continue.
- **Flag when:**
  - A companion forgot something important.
  - A chapter title or recap was wrong.
  - Replies got slow as the chat grew.
- **Stop when:** 80 turns and past Father's Summons, or 2 hours; split across days by stopping and continuing in T2-3.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - long-run memory
  - chapter seal
  - story so far / Previously
  - Memory tab
  - act change
- **Logged automatically:**
  - every memory write, consolidation and chapter seal (journal)
  - extraction reads and canon passes
  - prompt size per generation (payloads.jsonl)
- **Known limits:**
  - Chapter features are switched on for this session only; their defaults wait on the Q-M floors (plan 07).
  - Images and sprites are off.
  - The 07 Q-M legs are rated here.

### T2-2 Secrets

- **Question:** When the heir tells one character something another must not know, does only the told character act on it?
- **Setup:**
  - Story: `adolion-academy` (Adolion: House Nightriver); fresh chat; player mode.
  - Persona: A Nightriver heir with a spark of seal-born magic, home for the mid-year recess.
  - Starts at Home to Nightriver `nightriver-house`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Tell Shiya a secret alone**, aims at Home to Nightriver `nightriver-house`. Get Shiya alone; tell her something Natalia must not know.
     - Sample line: "Shiya, a word in private. The seals under this house are failing. Natalia must not hear it."
  2. **Answer Father's summons**, aims at Father's Summons `fathers-summons`. path = witch_king.
     - Sample line: "I'll go to Father's study."
  3. **Take the second's place or refuse**, aims at Whispers in the Halls `whispers` or Natalia Named `natalia-named`. heir_is_second or duel_refused.
     - Sample line: "I'll stand as the Crown's second."
     - Sample line: "No. I won't duel Leevon for your politics."
  4. **Test who knows**, aims at Whispers in the Halls `whispers`. Talk to Natalia and Welden; see whether either acts on the seals.
     - Sample line: "Natalia, is anything worrying you about the house?"
     - Sample line: "Welden, what do you know about the seals?"
- **Look for:**
  - Shiya treats the secret as known; Natalia and Welden do not. *(chat)*
  - The Memory tab shows the fact without exposing who hides what (player mode). *(Memory tab)*
  - Clues in Whispers are handed out for good questions only. *(chat)*
- **Must not happen** (press the flag at once):
  - Natalia or Welden mention the seals as if they knew (they do not; 'Who knows what').
  - Shiya volunteers the Duchess's night visits without being asked privately ('Who knows what').
  - Javon admits he asked the Crown for the second's place before he is exposed.
  - Welden's nightmares come up before he trusts the heir.
  - A character repeats a line only another character heard.
- **Provocations:**
  - Tell Natalia a false version of the secret, then ask Shiya about it.
  - Ask Ronan what Shiya told you.
- **Flag when:**
  - Someone knew something they were never told.
  - Someone forgot what you told them.
- **Stop when:** You are in Whispers in the Halls with two conversations tested, or 60 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - private knowledge (epistemic)
  - secrets kept
  - Memory tab
  - speaker direction
- **Logged automatically:**
  - every epistemic write (knows / hiding / unaware) per character
  - each drafted member's prompt, with or without its private block
  - judge memory checks
- **Known limits:**
  - The private block is per drafted member; a narrator line can still describe what the room saw.
  - Images and sprites are off.

### T2-3 Contradiction

- **Question:** When the player asserts something that contradicts an established fact, is it held for review instead of overwriting the fact?
- **Setup:**
  - Story: `adolion-saga` (Adolion: The Saga); continues the T2-1 chat; player mode.
  - Persona: The same Saga persona as T2-1.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Contradict the seal**, aims at Home to Nightriver `nightriver-house` or Father's Summons `fathers-summons`. Say the opposite of how the Devourer ended.
     - Sample line: "We never went past the seal, remember? Driftmere's mine is fine."
  2. **Contradict a companion fact**, aims at Home to Nightriver `nightriver-house` or Father's Summons `fathers-summons` or Whispers in the Halls `whispers`. Say something wrong about Riyo or Naomi.
     - Sample line: "Riyo's always had two ordinary arms."
  3. **Look at the memory queue**, aims at Home to Nightriver `nightriver-house` or Father's Summons `fathers-summons` or Whispers in the Halls `whispers`. Open the Memory tab and find what is held.
     - Sample line: "(no chat line: open the drawer's Memory tab)"
- **Look for:**
  - Your contradicting claim appears as held or conflicted, and the established fact still steers. *(Memory tab)*
  - The next replies still follow the established fact. *(chat)*
  - A continuity note (the warden) nudges the next reply toward the established fact. *(chat)*
- **Must not happen** (press the flag at once):
  - The contradicting claim replaces the established fact silently.
  - A character agrees with the contradiction as if it were true.
  - The held item shows internal ids or quality names in player mode.
- **Provocations:**
  - Contradict yourself twice in a row.
  - Contradict something only the narrator said.
- **Flag when:**
  - The held item was confusing.
  - The story picked up the wrong version.
- **Stop when:** Three contradictions tried and the queue read, or 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - contradiction handling
  - memory queue
  - continuity warden
- **Logged automatically:**
  - held / conflicted memory rows
  - warden notes and judge memory checks
  - extraction reads of your contradicting lines
- **Known limits:**
  - Only established facts (locked, authored or decided) hold a claim; a merely pinned fact does not.
  - A contradiction worded far from the fact may not be detected.

### T2-4 Away and back

- **Question:** After a day away from a long chat, does the recap let the player continue cold?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); continues the T1-1 chat; player mode.
  - Persona: The same persona as T1-1.
  - Settings: images off; sprites off.
  - Needs the T1-1 chat at 40+ turns and a real gap of at least a day.
- **Drive:**
  1. **Read cold**, aims at Into Needlehaven `into-needlehaven` or What Wendhope Knows `what-wendhope-knows`. Read the recap and the Overview before typing anything.
     - Sample line: "(read first)"
  2. **Continue from the recap alone**, aims at Into Needlehaven `into-needlehaven` or The Lord Spirit of Needlehaven `the-lord-spirit`. evidence >= 3 and knows_spirit.
     - Sample line: "We follow the white flowers deeper, while the sun is up."
- **Look for:**
  - The recap names where you are, the open threads and the last thing you did. *(popup)*
  - The Overview's threads match the recap. *(Overview)*
  - Your first reply after the recap makes sense in context. *(chat)*
- **Must not happen** (press the flag at once):
  - The recap spoils something not yet revealed (the Spirit, the taken).
  - The recap uses ids or boundary numbers.
  - The recap says something that did not happen.
- **Provocations:**
  - Ask the narrator 'where were we?' after the recap.
- **Flag when:**
  - The recap was wrong, too long, or unhelpful.
- **Stop when:** 10 turns after the recap, or 20 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - away recap
  - Overview threads
- **Logged automatically:**
  - the recap shown (journal)
  - the state at reopen
- **Known limits:**
  - The recap needs a gap; an early start reads as 'no recap'.

### T2-5 Memory tab

- **Question:** Can the player curate memory (pin, edit, exclude, lock as canon) and do the next turns obey?
- **Setup:**
  - Story: `adolion-saga` (Adolion: The Saga); continues the T2-1 chat; player mode.
  - Persona: The same Saga persona as T2-1.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Pin and edit**, aims at Father's Summons `fathers-summons` or Whispers in the Halls `whispers`. Pin one fact about Riyo; edit one fact about Naomi.
     - Sample line: "(no chat line: the Memory tab)"
  2. **Exclude one**, aims at Father's Summons `fathers-summons` or Whispers in the Halls `whispers`. Exclude a fact you dislike, then ask about it in chat.
     - Sample line: "Remember what happened with Naomi's duel?"
  3. **Lock one as canon**, aims at Whispers in the Halls `whispers` or Trial by Combat `the-duel`. Lock the Devourer outcome as canon, then contradict it in chat.
     - Sample line: "We left the Devourer alive, didn't we?"
- **Look for:**
  - Find and the tier filter make the fact easy to reach. *(Memory tab)*
  - An edited fact is what the next reply uses. *(chat)*
  - An excluded fact is no longer used. *(chat)*
  - A locked fact wins against your contradiction. *(Memory tab)*
- **Must not happen** (press the flag at once):
  - An excluded fact comes back into a reply.
  - An edit is lost after a reload.
  - The Memory tab shows superseded or internal rows in player mode.
  - A click in the tab does nothing without saying why.
- **Provocations:**
  - Reload right after an edit.
  - Swipe the reply right after pinning.
- **Flag when:**
  - A control was hard to find or did nothing.
  - The next turn ignored your curation.
- **Stop when:** All four actions tried and checked, or 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - pin
  - edit
  - exclude
  - lock as canon
  - Memory tab usability
- **Logged automatically:**
  - every memory decision and whether its save landed
  - the facts injected into each prompt
- **Known limits:**
  - Images and sprites are off.

### T2-6 Two chats, one story

- **Question:** Can two chats play the same story side by side without anything crossing between them?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat (two of them); player mode.
  - Persona: Two different adventurers, one per chat.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
  - so-session start makes two fresh chats of the adventurer group; you land in the second. The first is in the group's chat list.
- **Drive:**
  1. **Chat A: take Wendhope as one party**, aims at The Road North `road-to-wendhope`. Party name A.
     - Sample line: "We take Wendhope as the Red Hands."
  2. **Chat B: refuse, go to the tavern**, aims at Who Is Looking for a Party `adv-guild-tavern`. adv_looking_for_hands in chat B only.
     - Sample line: "Not that job. Let's see who's in the tavern."
  3. **Alternate turns**, aims at The Road North `road-to-wendhope` or Who Is Looking for a Party `adv-guild-tavern` or On the Road `on-the-road`. Switch chats every two turns for 20 turns.
     - Sample line: "(chat A) We ride north."
     - Sample line: "(chat B) Talis, what spells do you know?"
- **Look for:**
  - Each chat's HUD shows its own checkpoint. *(HUD)*
  - Each chat's Memory tab has only its own facts and party name. *(Memory tab)*
  - Checkpoint lore follows the open chat after every switch. *(timeline)*
- **Must not happen** (press the flag at once):
  - Chat B knows party name A, or chat A knows Talis.
  - A reply lands in the wrong chat.
  - Switching chats loses a message.
  - Rydel's gossip about the north road shows up in chat A's hall scene.
- **Provocations:**
  - Switch chats while a reply is still generating.
- **Flag when:**
  - Anything crossed.
  - A switch was slow or showed the wrong story for a moment.
- **Stop when:** 20 alternating turns, or 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - chat isolation
  - memory isolation
  - lore follows the chat
  - switching
- **Logged automatically:**
  - both chats' journals (the tail marks every switch)
  - save outcomes per switch
  - World Info activations per reply
- **Known limits:**
  - Global lorebooks are shared by design; only checkpoint-gated entries must follow the chat.

## T3

### T3-1 Everything on

- **Question:** With images, sprites, inner voice and the timeline all on, what helps the story and what distracts?
- **Setup:**
  - Story: `adolion-deep` (Adolion: Crimsonwing & Ebonwing); fresh chat; player mode.
  - Persona: The Nightriver heir leading a C-rank party at the Guild counter.
  - Starts at Two Wings at One Counter `deep-joint-posting`.
  - Settings: timeline level 1; images ON; sprites ON; inner voice on.
  - Needs the shared ComfyUI: start only with --allow-comfy after confirming nobody else is rendering.
  - This chat is continued by T3-2.
- **Drive:**
  1. **Choose a partner party**, aims at Crimsonwing at the North Gate `deep-with-crimsonwing` or Ebonwing at the North Gate `deep-with-ebonwing` or Kela and Ced `deep-kela-and-ced`. deep_partner crimsonwing or ebonwing (or refuse).
     - Sample line: "We'll go with Crimsonwing."
     - Sample line: "Ced, Kela, why should we pick either of you?"
  2. **March north**, aims at The North Road `deep-the-north-road` or The March `deep-the-march`. deep_set_out, then the quiet stretch.
     - Sample line: "Runo, what does your leader not say about the last expedition?"
  3. **Scout the keep**, aims at Carrow Keep `deep-ritual-fort`. deep_fort_sighted; every way in costs something.
     - Sample line: "We watch the patrols and time the change of watch."
  4. **Go in**, aims at The Altar in the Great Hall `deep-the-altar`. deep_hall_breached.
     - Sample line: "Over the wall at the change of watch."
- **Look for:**
  - Scene images arrive at the right moments and match the scene. *(chat)*
  - Sprites show who is speaking and do not lag behind replies. *(chat)*
  - The inner voice adds something at decisions and stays out of the way otherwise. *(chat)*
  - Timeline chips stay readable with everything on. *(timeline)*
- **Must not happen** (press the flag at once):
  - An image or sprite shows a character not in the scene.
  - Ced or Kela mentions their Darklands split at the counter ('Who knows what').
  - Kela's witness mark on the Wind Ballad death report comes up before the reckoning.
  - Runo blurts out whose heir you are ('Who knows what': too flustered to say it).
  - A reply waits on an image.
- **Provocations:**
  - Swipe a reply that carried an image.
  - Reload while an image is rendering.
- **Flag when:**
  - Something distracted you.
  - An image or sprite was wrong or late.
- **Stop when:** You are inside the keep, or 60 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - scene images
  - sprites
  - inner voice
  - timeline at level 1
  - overall presentation
- **Logged automatically:**
  - image and sprite cues and results
  - inner-voice beats (used, stale, missing)
  - prompts sent
- **Known limits:**
  - Image quality depends on the ComfyUI workflow, not this extension.
  - The inner voice is the 06 C3 leg: rate it here.

### T3-2 Timeline levels

- **Question:** Does each timeline level show what it promises, and do the author levels and the message inspector help an author?
- **Setup:**
  - Story: `adolion-deep` (Adolion: Crimsonwing & Ebonwing); continues the T3-1 chat; player mode.
  - Persona: The same persona as T3-1.
  - Settings: timeline level 0; images off; sprites off.
  - Images and sprites are switched back off for this session.
- **Drive:**
  1. **Levels 0, 1, 2 in player mode**, aims at The Altar in the Great Hall `deep-the-altar` or The Cells of Nahalbuk `deep-nahalbuk-cells`. Play 3 turns at each level (settings panel, timeline level).
     - Sample line: "We cut the captive loose and get out of the hall!"
  2. **Author view, levels 3 and 4**, aims at The Cells of Nahalbuk `deep-nahalbuk-cells` or What Unira Says `deep-what-unira-says`. Turn Author view on, then level 3, then 4.
     - Sample line: "Unira, who left you down here?"
  3. **Open the message inspector**, aims at What Unira Says `deep-what-unira-says`. Click an author chip under a transition reply.
     - Sample line: "(no chat line: the inspector)"
- **Look for:**
  - Level 0 shows nothing, 1 story beats, 2 behind-the-scenes in player words. *(timeline)*
  - Levels 3-4 appear only with Author view on. *(timeline)*
  - The inspector groups one message's items by category. *(inspector)*
- **Must not happen** (press the flag at once):
  - Level 2 in player mode shows ids, gate keys or gated entry names.
  - Author levels show without Author view.
  - Kela's or Ced's part in Unira's death report is shown to the player before Unira's story ('Who knows what').
- **Provocations:**
  - Swipe a reply and watch its chips.
  - Switch level while a reply is generating.
- **Flag when:**
  - A level was noisy or confusing.
  - The inspector did not open or was empty.
- **Stop when:** All five levels and the inspector tried, or 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - timeline level 0-2
  - timeline level 3-4
  - message inspector
  - A1 inspector decision input
- **Logged automatically:**
  - the inline timeline items per message
  - lore fired per reply
- **Known limits:**
  - The C5/C6 surface decisions are made from this and T3-1.

### T3-3 Inner voice

- **Question:** At decision moments, does the inner voice add real motive to the characters, or does it repeat what is already on the page?
- **Setup:**
  - Story: `adolion-night` (Adolion: Night Courts); fresh chat; player mode.
  - Persona: The leader of a C-rank Guild party at Glasnoa.
  - Starts at The Accused `night-the-accused`, seeded by `so-session start`.
  - Settings: images off; sprites off; inner voice on.
- **Drive:**
  1. **The trial**, aims at The Accused `night-the-accused`. Selena chained, Ren raising the stake, Erevan behind his mask.
     - Sample line: "Erevan, do you believe the book was hers?"
     - Sample line: "Selena, tell me what happened in your room."
  2. **Decide Selena's fate**, aims at The Witch of Thornwood `night-the-thornwood` or Erevan Insists `night-erevan-insists`. night_selena freed or handed_over (and night_in_thornwood), or night_stood_aside.
     - Sample line: "She goes free. The book was planted."
     - Sample line: "This isn't our business. We're leaving."
  3. **Meet the potion-seller**, aims at The Witch of Thornwood `night-the-thornwood`. Kayla appears; watch motives.
     - Sample line: "Kayla, what's in the lake?"
- **Look for:**
  - Characters act from their own aims (Erevan's doubt, Selena's fear) without saying them outright. *(chat)*
  - Replies at the decision feel more motivated than ordinary turns. *(chat)*
- **Must not happen** (press the flag at once):
  - Selena confesses what the Inquisitors tried in front of the village ('Who knows what': too frightened).
  - Reeve Tull's planting of the book comes out before anyone presses him.
  - Erevan says the book was planted before someone else says it first.
  - The inner voice text itself is visible in chat.
- **Provocations:**
  - Ask Erevan a question with a yes/no answer he should dodge.
  - Stay silent while Ren argues.
- **Flag when:**
  - A character felt flat or repeated itself.
  - Someone suddenly knew too much.
- **Stop when:** You reach The Witch of Thornwood, or 40 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - inner voice (adds vs repeats)
  - secrets kept
  - agency at the decision
- **Logged automatically:**
  - inner-voice beats used, stale or missing
  - each drafted member's prompt
- **Known limits:**
  - The inner voice is off by default; this session switches it on.
  - 06 C3 is rated with T3-1.

### T3-4 Spoiler hunt

- **Question:** Can a player who actively looks for leaks find ids, gated lore names, future checkpoints or internals anywhere in player mode?
- **Setup:**
  - Story: `adolion-aegis` (Adolion: Between the Roads); fresh chat; player mode.
  - Persona: A curious adventurer who reads every panel.
  - Starts at Homecoming `aegis-homecoming`.
  - Settings: timeline level 2; images off; sprites off.
- **Drive:**
  1. **Read every surface**, aims at Homecoming `aegis-homecoming`. HUD, Overview, Memory tab, timeline at 2, settings panel, tooltips.
     - Sample line: "We'll sit the exam. What does it involve?"
  2. **Play into the shop**, aims at The Guild Tavern `aegis-the-tavern` or Market Street `aegis-market-street` or Aegis Delights and Curios `aegis-the-curio-shop`. Sophie and Calithra carry big hidden truths.
     - Sample line: "Sophie, what are you really?"
     - Sample line: "Calithra, why won't you take Darklands jobs?"
  3. **Try the slash commands a player might**, aims at Aegis Delights and Curios `aegis-the-curio-shop` or Victory's Tusk `aegis-victorys-tusk`. /story recap, /story threads.
     - Sample line: "(type) /story recap"
- **Look for:**
  - Every surface speaks in story names only. *(Overview)*
  - Hover text and tooltips carry no internals. *(settings panel)*
  - /story output is player-safe. *(chat)*
- **Must not happen** (press the flag at once):
  - A checkpoint id, quality name, lorebook entry name or future checkpoint name is visible anywhere.
  - Sophie's ice-dragon secret appears in any panel ('Who knows what').
  - Yrelra is called a succubus by any surface or character before it is sensed ('Who knows what').
  - The next-turn preview, driver or curator controls show in player mode.
- **Provocations:**
  - Right-click and hover everything.
  - Open the drawer during a transition.
- **Flag when:**
  - Anything looked like an internal name, even if unsure.
- **Stop when:** Every surface read at least twice, or 40 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - HUD
  - Overview
  - Memory tab
  - timeline level 2
  - slash commands
- **Logged automatically:**
  - the journal (what the player could have seen)
  - extension console errors
- **Known limits:**
  - The chat itself may name places a character knows; that is story, not a leak.

### T3-5 Curator ring

- **Question:** Are the World Info curator's proposals worth reviewing, and is accepting and rejecting them easy?
- **Setup:**
  - Story: `adolion-east` (Adolion: The Eastern Road); fresh chat; author mode.
  - Persona: The leader of a C-rank party in Hianxo, played as an author checking the curator.
  - Starts at Landfall at Hianxo `east-landfall`.
  - Settings: images off; sprites off; curator on (review).
  - Author view is on: the curator ring is in the drawer's Scheduler tab.
- **Drive:**
  1. **Play to the Academy**, aims at Jiansho Academy `east-jiansho-academy`. Give the curator material: names, places, new facts.
     - Sample line: "Honami, tell us about Megumi."
  2. **Review proposals**, aims at Jiansho Academy `east-jiansho-academy` or The Opening Rounds `east-the-rounds`. Accept some, reject some, edit one.
     - Sample line: "(no chat line: the Scheduler tab)"
  3. **Check the effect**, aims at The Opening Rounds `east-the-rounds` or The Upset `east-the-upset` or The Hattaxi Shadow `east-the-hattaxi-shadow`. Accepted entries apply at the next boundary; see them fire.
     - Sample line: "Hanzo, you're no steward. Who are you?"
- **Look for:**
  - Proposals are specific, correct and in the story's Chronicle book. *(author panel)*
  - Accepting applies at the next reply, not instantly. *(author panel)*
  - An accepted entry fires when its keyword comes up. *(timeline)*
- **Must not happen** (press the flag at once):
  - A proposal edits a checkpoint-gated entry.
  - A proposal writes outside the story's curator lorebooks.
  - A rejected proposal is applied anyway.
  - Megumi's brother as target reaches a proposal before the Hattaxi reveal ('Who knows what').
- **Provocations:**
  - Swipe the reply after accepting a proposal (it should revert).
  - Accept then reject the same op.
- **Flag when:**
  - A proposal was useless or wrong.
  - The review UI was confusing.
- **Stop when:** At least 5 proposals decided, or 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - curator proposal quality
  - review UI
  - apply timing
  - rollback of applied ops
- **Logged automatically:**
  - every curator proposal and decision (stagecraft journal)
  - lorebook writes and reverts
- **Known limits:**
  - The curator has no create op (it edits existing entries only).

### T3-6 Small screen

- **Question:** At phone width, are the drawer, HUD, timeline and Studio usable?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Persona: Any adventurer persona.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off; viewport 390x844.
  - The session holds a 390x844 viewport while its tails run.
- **Drive:**
  1. **Play the hall**, aims at The Guild Hall `guild-hall`. Use the drawer and HUD with a thumb in mind.
     - Sample line: "What's on the board?"
  2. **Take the job**, aims at The Road North `road-to-wendhope`. Watch the transition chip and HUD at this width.
     - Sample line: "We take Wendhope as the Short Straws."
  3. **Open the Studio**, aims at The Road North `road-to-wendhope` or On the Road `on-the-road`. Turn Author view on briefly and open the Studio.
     - Sample line: "(no chat line: open the Studio)"
- **Look for:**
  - Nothing scrolls sideways; every control can be reached. *(drawer)*
  - The HUD fits above the input. *(HUD)*
  - Timeline chips wrap without overlapping text. *(timeline)*
  - The Studio opens and can be closed. *(Studio)*
- **Must not happen** (press the flag at once):
  - A control is cut off or unreachable.
  - The send button is hidden by our UI.
  - The drawer cannot be closed.
- **Provocations:**
  - Rotate expectations: open the drawer and settings panel together.
- **Flag when:**
  - Anything felt cramped or needed zooming.
- **Stop when:** Every surface visited, or 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - drawer (narrow)
  - HUD (narrow)
  - timeline (narrow)
  - Studio (narrow)
- **Logged automatically:**
  - the viewport in session.json
  - extension console errors
- **Known limits:**
  - The emulated viewport changes width only; ST's own mobile layout (user agent based) is not triggered.

## T4

### T4-1 Abuse

- **Question:** When the player swipes, edits and deletes at every feature's moment, do story, memory, timeline and saves still agree?
- **Setup:**
  - Story: `adolion-academy` (Adolion: House Nightriver); fresh chat; player mode.
  - Persona: A Nightriver heir who keeps changing their mind.
  - Starts at Home to Nightriver `nightriver-house`.
  - Settings: images off; sprites off; inner voice on; chapters: seal on, storySoFar on; curator on (review).
- **Drive:**
  1. **Swipe a transition**, aims at Father's Summons `fathers-summons`. path = witch_king; swipe the reply that moved it.
     - Sample line: "I go to Father's study at once."
  2. **Edit a memory moment**, aims at Father's Summons `fathers-summons` or Whispers in the Halls `whispers`. Say something memorable, then edit it away.
     - Sample line: "I swear on Mother's grave I'll never duel for this house."
  3. **Delete during a curator proposal**, aims at Whispers in the Halls `whispers` or Natalia Named `natalia-named`. Delete the last reply while a proposal is pending.
     - Sample line: "Shiya, who comes through the servants' door at night?"
  4. **Swipe at the duel**, aims at Trial by Combat `the-duel` or The Night of Knives `night-of-knives`. duel_outcome; swipe the outcome reply twice.
     - Sample line: "I show the court the venom on his lance."
- **Look for:**
  - After each mutation, the HUD, Memory tab and timeline agree with the chat. *(Overview)*
  - The step-back notice names the checkpoint you returned to. *(Overview)*
  - A pending curator proposal from a deleted reply is withdrawn. *(chat)*
- **Must not happen** (press the flag at once):
  - A fact from an edited-away line remains in memory.
  - The story stays ahead of the chat after a swipe.
  - A chat message disappears that you did not delete.
  - Natalia learns she carries a seal before the crypt ('Who knows what').
- **Provocations:**
  - Swipe during generation.
  - Edit a message five back.
- **Flag when:**
  - Anything disagreed after a mutation.
- **Stop when:** Every mutation tried at two different moments, or 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - rollback: story
  - rollback: memory
  - rollback: timeline
  - saves after mutations
- **Logged automatically:**
  - every rollback and boundary regression
  - save outcomes
  - memory derived records and reversals
- **Known limits:**
  - Images and sprites are off (no ComfyUI in this tier).

### T4-2 Switching

- **Question:** When the player switches chats mid-generation, branches, or reloads during generation, does anything land in the wrong place?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Also open: a fresh `adolion-esha` chat (Adolion: Eshalanore).
  - Persona: Any adventurer persona.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
  - so-session start opens a fresh Eshalanore chat first, then this adventurer chat.
- **Drive:**
  1. **Switch mid-generation**, aims at The Guild Hall `guild-hall` or The Road North `road-to-wendhope`. Send, then switch to the Eshalanore chat while the reply streams.
     - Sample line: "We take Wendhope as the Loose Ends."
  2. **Branch**, aims at The Road North `road-to-wendhope` or On the Road `on-the-road`. Branch from an earlier message and continue both.
     - Sample line: "We ride north."
  3. **Reload during generation**, aims at On the Road `on-the-road` or Hold, Wendhope Is Closed `at-the-walls`. Send, then reload the page mid-stream.
     - Sample line: "We reach the walls. Hello the gate!"
- **Look for:**
  - Each chat keeps its own messages and story after the switch. *(chat)*
  - A branch takes the parent's story state up to the branch point. *(HUD)*
  - After a reload the chat and HUD agree. *(HUD)*
- **Must not happen** (press the flag at once):
  - A chat loses messages or is emptied.
  - A reply lands in the other chat.
  - The integrity popup appears or the page wedges.
  - Eshalanore lore reaches the adventurer chat.
- **Provocations:**
  - Switch twice quickly.
- **Flag when:**
  - Anything felt off after a switch, even briefly.
- **Stop when:** Each move tried twice, or 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - switch mid-generation
  - branching
  - reload mid-generation
  - no lost messages
- **Logged automatically:**
  - saves with the chat they were for and where they landed
  - both chats' journals
- **Known limits:**
  - ST's own debounced saves are not ours to guard; a loss there is a host finding.

### T4-3 Cleanup

- **Question:** When a player deletes a chat, is the story-memory lorebook prompt clear, and do both answers do what they say?
- **Setup:**
  - Story: `adolion-aegis` (Adolion: Between the Roads); fresh chat (two of them); player mode.
  - Persona: Any adventurer persona.
  - Starts at Homecoming `aegis-homecoming`.
  - Settings: images off; sprites off.
  - Two throwaway chats: play 5 turns in each so each gets a memory book, then delete both.
- **Drive:**
  1. **Give each chat memory**, aims at Homecoming `aegis-homecoming` or The Guild Tavern `aegis-the-tavern`. 5 turns each.
     - Sample line: "Put us down for the exam."
     - Sample line: "Fiana, what makes a party fail?"
  2. **Delete chat one: keep the book**, aims at Homecoming `aegis-homecoming` or The Guild Tavern `aegis-the-tavern`. Answer the lorebook prompt with keep.
     - Sample line: "(no chat line: delete the chat)"
  3. **Delete chat two: delete the book**, aims at Homecoming `aegis-homecoming` or The Guild Tavern `aegis-the-tavern`. Answer with delete.
     - Sample line: "(no chat line: delete the chat)"
- **Look for:**
  - The prompt names the chat and the book in plain words. *(popup)*
  - Keep leaves the book; delete removes it; no Repair row after either. *(settings panel)*
- **Must not happen** (press the flag at once):
  - The prompt appears for a chat you did not delete.
  - A book is deleted when you chose keep.
  - A Repair row nags about a book you chose to delete.
  - The prompt blocks later popups.
- **Provocations:**
  - Close the prompt with Escape.
- **Flag when:**
  - The prompt wording was unclear.
- **Stop when:** Both deletes done and checked, or 20 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - mirror-book prompt
  - keep
  - delete
  - Repair after delete
- **Logged automatically:**
  - the reaper's decision (journal)
  - lorebook list before and after (run header diff)
- **Known limits:**
  - The run header diff will show the chats and books you deleted; that is expected here.

### T4-4 Restart and update

- **Question:** Does Restart reset only this chat's story, and does taking a library update mid-run keep what it should?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; author mode.
  - Persona: Any adventurer persona, played by the author.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Play a few turns, then Restart**, aims at The Road North `road-to-wendhope` or The Guild Hall `guild-hall`. Take the job, then Restart story from the Overview footer.
     - Sample line: "We take Wendhope as the Second Tries."
  2. **Edit the story in the Studio and save**, aims at The Road North `road-to-wendhope` or On the Road `on-the-road`. Change one checkpoint's guidance (compatible edit): hot-swap.
     - Sample line: "(no chat line: Studio)"
  3. **Make an invalidating edit**, aims at On the Road `on-the-road` or Hold, Wendhope Is Closed `at-the-walls`. Remove a quality the chat uses: the keep / restart / cancel choice.
     - Sample line: "(no chat line: Studio, then choose keep)"
- **Look for:**
  - Restart asks first, then returns to The Guild Hall with memory cleared. *(popup)*
  - A compatible save applies silently; the toolbar says saved. *(Studio)*
  - An invalidating save says the edit is in the library before asking. *(popup)*
  - 'Update to vN' appears only in other chats of the story. *(Overview)*
- **Must not happen** (press the flag at once):
  - Restart touches another chat.
  - An update is applied to a chat that did not ask for it.
  - Keeping after an invalidating edit leaves orphaned values.
  - The chat loses messages on restart.
- **Provocations:**
  - Cancel the invalidating choice.
- **Flag when:**
  - The save / apply wording confused you.
- **Stop when:** Restart, a hot-swap and an invalidating keep all done, or 40 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - Restart
  - hot-swap
  - invalidating choice
  - save vocabulary
- **Logged automatically:**
  - story update records (from/to version, classification, choice)
  - the library in the run header diff
- **Known limits:**
  - Edits change the lane's library copy only.

## T5

### T5-1 Wizard, premise 1

- **Question:** Can the author make a playable story from the first premise with the wizard in review mode, and play 20 turns of it?
- **Setup:**
  - Story: a new story from the wizard: "A cartographer's apprentice learns that the map she is inking redraws the kingdom each night, and three noble houses will kill to hold her pen."; fresh chat; author mode.
  - Persona: An author; later, the apprentice cartographer.
  - Settings: images off; sprites off.
  - Start from the settings panel: New story (wizard). Review mode: every change waits for you.
  - This story is continued by T5-3 and T5-4.
- **Drive:**
  1. **Premise and interview**. Paste the premise; answer the wizard's questions, use 'You decide' once.
     - Sample line: "A cartographer's apprentice learns that the map she is inking redraws the kingdom each night, and three noble houses will kill to hold her pen."
  2. **Turning points and characters**. Review each proposed change; reject one.
     - Sample line: "Make the third house quieter and more dangerous."
  3. **Setup: provisioning**. Apply the character cards, lorebook and group one card at a time.
     - Sample line: "(no chat line: provisioning cards)"
  4. **Play 20 turns**. Open the new group's chat and play.
     - Sample line: "I finish inking the northern border and watch the ink move."
- **Look for:**
  - Every change waits for your review. *(wizard)*
  - Provisioning cards create exactly what they say, one at a time. *(wizard)*
  - The requirements go green from what was created. *(settings panel)*
  - The first transition fires from play. *(HUD)*
- **Must not happen** (press the flag at once):
  - The wizard writes anything without your confirmation.
  - A persona is created or changed.
  - A provisioning card is applied by 'accept all'.
  - The story fails to load after saving.
- **Provocations:**
  - Ask the wizard to do something outside a story (write a lorebook for another story).
- **Flag when:**
  - You had to touch JSON.
  - A step was unclear.
- **Stop when:** The story is saved and 20 turns are played, or 90 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - wizard interview
  - review mode
  - provisioning
  - playability of the result
- **Logged automatically:**
  - the wizard transcript and every tool call
  - created assets (the wizard ledger)
  - the first 20 turns' journal
- **Known limits:**
  - The wizard route is the local model; the harness route is T6-3.

### T5-2 Wizard, premises 2 and 3

- **Question:** In auto-draft mode, does the wizard produce two stories whose provisioning still waits for the author?
- **Setup:**
  - Story: a new story from the wizard: "In a city where debts are paid in years of memory, a pawnbroker of forgotten days is hired to recover the queen's stolen childhood."; fresh chat; author mode.
  - Persona: An author.
  - Settings: images off; sprites off.
  - Second premise: A dragon too old to fly hires a crew of thieves to steal its own hoard back from the knights who claim to have slain it.
  - Switch the wizard to auto-draft for both.
- **Drive:**
  1. **Premise 2 in auto-draft**. Edits land in the draft directly; provisioning still waits.
     - Sample line: "In a city where debts are paid in years of memory, a pawnbroker of forgotten days is hired to recover the queen's stolen childhood."
  2. **Premise 3 in auto-draft**. Same, second story.
     - Sample line: "A dragon too old to fly hires a crew of thieves to steal its own hoard back from the knights who claim to have slain it."
  3. **Apply provisioning cards**. Characters, lorebook, group, one by one.
     - Sample line: "(no chat line: provisioning cards)"
- **Look for:**
  - Auto-draft moves fast but every provisioning card waits. *(wizard)*
  - Each story diagnoses clean before saving. *(Studio)*
- **Must not happen** (press the flag at once):
  - A character card, lorebook or group appears before you applied its card.
  - The two stories share or overwrite each other's assets.
  - A draft is saved over an existing story id.
- **Provocations:**
  - Undo an auto-draft change.
- **Flag when:**
  - Auto-draft did something surprising.
- **Stop when:** Both stories saved, or 90 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - auto-draft
  - provisioning waits
  - diagnostics
- **Logged automatically:**
  - wizard transcripts
  - created assets
- **Known limits:**
  - The stories are not played here beyond a smoke turn.

### T5-3 Studio edit

- **Question:** Can the author change a checkpoint, a gate and an effect in the Studio and have the running chat take it correctly?
- **Setup:**
  - Story: a new story from the wizard; continues the T5-1 chat; author mode.
  - Persona: The author of the T5-1 story.
  - Settings: images off; sprites off.
  - Open the T5-1 story's chat yourself; so-session start does not know its group.
- **Drive:**
  1. **Edit guidance**. Compatible: hot-swap.
     - Sample line: "(no chat line: Studio)"
  2. **Edit a gate**. Change a threshold; save; play until it fires.
     - Sample line: "I show the House of Ash the redrawn map."
  3. **Edit an effect**. Add a background or cast change.
     - Sample line: "(no chat line: Studio)"
- **Look for:**
  - Diagnostics say what a problem costs before the technical message. *(Studio)*
  - The running chat reflects the edit after save. *(HUD)*
- **Must not happen** (press the flag at once):
  - A save claims success but the chat still plays the old version.
  - The Studio loses an edit on tab switch.
  - You need to edit JSON.
- **Provocations:**
  - Save an invalid story.
- **Flag when:**
  - An editor was confusing.
- **Stop when:** Three edits taken, or 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - checkpoint editor
  - gate editor
  - effects editor
  - diagnostics
  - hot-swap / invalidating choice
- **Logged automatically:**
  - story update records
  - library in the run header diff
- **Known limits:**
  - so-session cannot seed the wizard story's chat; the lane is the T5-1 lane.

### T5-4 Repair

- **Question:** When a requirement breaks, does Repair name the one missing step and does Fix with wizard fix it?
- **Setup:**
  - Story: a new story from the wizard; continues the T5-1 chat; author mode.
  - Persona: The author of the T5-1 story.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Disable a member**. Disable a required member in the group; read Repair.
     - Sample line: "(no chat line: group panel)"
  2. **Drop a book**. Deselect the story's lorebook; read Repair.
     - Sample line: "(no chat line: World Info panel)"
  3. **Fix with wizard**. Use Fix with wizard from the author panel.
     - Sample line: "(no chat line)"
- **Look for:**
  - Repair names one step, consequence first, and reveals the control. *(settings panel)*
  - Fix with wizard proposes only what is missing. *(wizard)*
- **Must not happen** (press the flag at once):
  - Repair lists several things at once.
  - Fix with wizard creates a persona or edits the story beyond the gap.
  - A Repair row stays after the fix.
- **Provocations:**
  - Break two things at once.
- **Flag when:**
  - The Repair text was unclear.
- **Stop when:** Both breaks repaired, or 30 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - Repair
  - Fix with wizard
- **Logged automatically:**
  - requirement readings
  - wizard provisioning
- **Known limits:**
  - Personas are never provisioned.

### T5-5 Author view

- **Question:** Do the author panels explain the story machine well enough to steer it, and does steering work?
- **Setup:**
  - Story: `adolion-war` (Adolion: Fire and War); fresh chat; author mode.
  - Persona: The Nightriver heir, played by the author.
  - Starts at The King's War Council `war-the-summons`.
  - Settings: images off; sprites off.
- **Drive:**
  1. **Read the panels at the council**, aims at The King's War Council `war-the-summons`. Blackboard, Scheduler, Payload, next-turn preview.
     - Sample line: "King Alexander, what exactly is the commission?"
  2. **Nudge**, aims at The King's War Council `war-the-summons` or The Queen's Wing `war-the-queens-wing`. Use Nudge toward the refusal branch and see the next reply.
     - Sample line: "We'll think about it."
  3. **Advance**, aims at Fort Vicinitas `war-the-front`. Use Advance once and compare with playing it.
     - Sample line: "We ride for Fort Vicinitas."
- **Look for:**
  - The next-turn preview matches what the payload capture shows. *(author panel)*
  - A nudge changes one reply and then stops. *(chat)*
  - Advance is logged as an author move, not play. *(author panel)*
- **Must not happen** (press the flag at once):
  - The preview disagrees with the prompt actually sent.
  - A nudge persists for several turns.
  - Author panels leak into player mode after turning author view off.
- **Provocations:**
  - Turn Author view off and on mid-scene.
- **Flag when:**
  - A panel was unreadable or misleading.
- **Stop when:** Each panel read and each control used once, or 45 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - blackboard
  - scheduler
  - payload / next-turn preview
  - driver (Nudge / Advance)
  - A1 inspector decision
- **Logged automatically:**
  - manual checkpoint changes (logged as author moves)
  - payload captures
- **Known limits:**
  - An Advance is logged as an unexpected jump by the digest on purpose.

## T6

### T6-1 Reasoning

- **Question:** Does each recommended reasoning setting play at least as well as the default on the T1-1 route?
- **Setup:**
  - Story: `adolion-adventurer` (Adolion: The Adventurer's Road); fresh chat; player mode.
  - Persona: The same persona as T1-1.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
  - Apply one row of docs/plans/v2.6/recommended-reasoning.md per run (settings panel, per role), and note which in the rubric.
- **Drive:**
  1. **Replay the hall**, aims at The Road North `road-to-wendhope`. Same lines as T1-1.
     - Sample line: "We'll take Wendhope. Call us the Grey Pennants."
  2. **Replay the walls**, aims at Hold, Wendhope Is Closed `at-the-walls` or The Red Fog `first-night`. Same lines as T1-1.
     - Sample line: "Here's the Guild seal and the Sheridan contract. Open up."
- **Look for:**
  - Extraction lands as fast as in T1-1. *(HUD)*
  - Replies are no slower to feel. *(chat)*
- **Must not happen** (press the flag at once):
  - An empty reply (reasoning ate the budget).
  - A read that never lands.
  - The narrator decides for you.
- **Provocations:**
  - none for this session
- **Flag when:**
  - Anything slower or worse than T1-1.
- **Stop when:** The walls reached, per setting; about 30 minutes each.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - reasoning setting (name it)
  - latency
  - extraction quality
- **Logged automatically:**
  - reasoning exhausted / empty reply events
  - model-call latency per pass
- **Known limits:**
  - 05 R4 is rated here.
  - If the recommended table does not exist yet, this charter waits.

### T6-2 Judge providers

- **Question:** Does each recommended judge provider per use keep speaker direction and memory at least as good as the default?
- **Setup:**
  - Story: `adolion-war` (Adolion: Fire and War); fresh chat; player mode.
  - Persona: The same persona as T1-3.
  - Starts at The King's War Council `war-the-summons`.
  - Settings: images off; sprites off.
  - Apply one recommended provider row (docs/plans/v2.6/12-provider-matrix.md) per run.
- **Drive:**
  1. **Replay named addressing**, aims at The King's War Council `war-the-summons`. Same lines as T1-3.
     - Sample line: "Princess Haley, do you believe the rumour about your mother?"
  2. **Replay the commission**, aims at Fort Vicinitas `war-the-front` or The Queen's Wing `war-the-queens-wing`. Same lines as T1-3.
     - Sample line: "We take the King's commission."
- **Look for:**
  - Speaker choice as good as T1-3. *(chat)*
  - No judge fallbacks for the routed uses. *(author panel)*
- **Must not happen** (press the flag at once):
  - A routed use refuses as uncalibrated.
  - The wrong member answers a named question.
- **Provocations:**
  - none for this session
- **Flag when:**
  - Anything worse than T1-3.
- **Stop when:** Both beats per provider row, about 20 minutes each.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - provider (name it)
  - speaker direction
  - fallbacks
- **Logged automatically:**
  - judge calls with provider route, latency and fallback
- **Known limits:**
  - An uncalibrated route falls back on purpose (logged).

### T6-3 Harness routing

- **Question:** Does the wizard work through the CLI harness route as well as through the local route?
- **Setup:**
  - Story: a new story from the wizard: "A cartographer's apprentice learns that the map she is inking redraws the kingdom each night, and three noble houses will kill to hold her pen."; fresh chat; author mode.
  - Persona: An author.
  - Settings: images off; sprites off.
  - Needs a fresh CLI login (opencode) before starting.
  - Route the wizard role to the harness in the settings panel.
- **Drive:**
  1. **Replay T5-1 through the harness**. Same premise, review mode.
     - Sample line: "A cartographer's apprentice learns that the map she is inking redraws the kingdom each night, and three noble houses will kill to hold her pen."
- **Look for:**
  - Tool calls parse on the first try more often than the local route. *(wizard)*
  - Provisioning still waits for you. *(wizard)*
- **Must not happen** (press the flag at once):
  - The harness writes anything without confirmation.
  - A harness failure is silent.
- **Provocations:**
  - none for this session
- **Flag when:**
  - The route fell back without saying so.
- **Stop when:** The story is saved, or 60 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - harness route
  - fallback visibility
- **Logged automatically:**
  - model calls with route and result
  - wizard transcript
- **Known limits:**
  - Harness scope is opencode only.

### T6-4 Judge off

- **Question:** With the judge fully off, does every feature fall back silently and does T2-2 still play?
- **Setup:**
  - Story: `adolion-academy` (Adolion: House Nightriver); fresh chat; player mode.
  - Persona: The same persona as T2-2.
  - Starts at Home to Nightriver `nightriver-house`.
  - Settings: judge fully off; images off; sprites off.
- **Drive:**
  1. **Replay the secret**, aims at Home to Nightriver `nightriver-house`. Same lines as T2-2.
     - Sample line: "Shiya, a word in private. The seals under this house are failing. Natalia must not hear it."
  2. **Replay the summons**, aims at Father's Summons `fathers-summons` or Whispers in the Halls `whispers`. Same lines as T2-2.
     - Sample line: "I'll stand as the Crown's second."
- **Look for:**
  - No judge notices, errors or stalls. *(Overview)*
  - Speaker direction still works (rules or LLM director). *(chat)*
- **Must not happen** (press the flag at once):
  - An error or 'judge unavailable' message shown to the player.
  - A stall that T2-2 did not have.
  - Natalia learns about the seals ('Who knows what').
- **Provocations:**
  - none for this session
- **Flag when:**
  - Anything noticeably worse than T2-2.
- **Stop when:** You are in Whispers in the Halls, or 40 minutes.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - silent fallback
  - speaker direction without judge
  - memory without judge
- **Logged automatically:**
  - judge calls (there should be none but disabled fallbacks)
- **Known limits:**
  - Disabled fallbacks are expected and not flagged by the digest.

## T7

### T7 Freeze

- **Question:** On the frozen build, does a free hour of play hold up with nothing new to report?
- **Setup:**
  - Story: `adolion-saga` (Adolion: The Saga); fresh chat; player mode.
  - Persona: Your own Saga persona.
  - Starts at The Guild Hall `guild-hall`.
  - Settings: images off; sprites off.
  - Free session: play the way you would at home.
- **Drive:**
  1. **Play freely from the start**, aims at The Guild Hall `guild-hall` or The Road North `road-to-wendhope`. No script.
     - Sample line: "Let's see what's on the board."
  2. **Wherever it goes**, aims at Hold, Wendhope Is Closed `at-the-walls` or The Red Fog `first-night` or Who Is Looking for a Party `adv-guild-tavern`. Keep playing.
     - Sample line: "(your own lines)"
- **Look for:**
  - Nothing you have flagged before comes back. *(chat)*
  - Every surface reads right. *(Overview)*
- **Must not happen** (press the flag at once):
  - Any blocker or broken finding from an earlier tier reappears.
  - A character knows what only another was told.
  - The narrator decides for you.
- **Provocations:**
  - none for this session
- **Flag when:**
  - Anything at all that you would not ship.
- **Stop when:** One hour.
- **Rubric** (score each works / annoying / broken / not noticed, with a note):
  - overall
  - would you ship it?
- **Logged automatically:**
  - everything the other sessions log
- **Known limits:**
  - Images and sprites are off unless you restart with --allow-comfy and a card that asks for them.
