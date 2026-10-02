# Judge first pass: prompt

Model: `openai/gpt-6-astra` via `opencode run --pure` (tools off, no login step; the CLI's existing provider auth).

System text:

```text
You are a careful, impartial reader of roleplay fiction. You answer with exactly one JSON object.
```

Per-turn prompt (T01 shown; every turn uses the same template over its own context and replies):

```text
You are rating four candidate replies in a group roleplay chat, blind. The replies are labelled A-D in random order.
Each reply is written as Tobias, continuing the chat below. The player is a human; a reply must never narrate, speak for or decide for the player.

Score every reply 1 (bad) to 5 (excellent) on each criterion:
- coherence: coherence / no loops: the reply makes sense and does not repeat lines or sentences
- prose: prose quality: no dropped, doubled or glued words; reads as finished English
- scene: follows the scene and the addressee: answers what the player just did or asked, in the right voice, consistent with the context
- agency: agency respected: does not narrate, speak for or decide for the player
- overall: overall: which reply would you rather have in the game
Then rank the four replies best first. A reply cut off at the length limit counts against coherence only if what is there is broken or looping.

Answer with ONE JSON object and nothing else, shaped exactly:
{"scores":{"A":{"coherence":n,"prose":n,"scene":n,"agency":n,"overall":n},"B":{...},"C":{...},"D":{...}},"rank":["?","?","?","?"],"why":"one or two sentences"}

SITUATION (story direction the writer was given):
Direction for Tobias only: Tobias knows only what the posting says and suspects it is worse, because the Sheridans do not overpay for collapsed shafts. He says so if asked.
Objective: Take a posting and form a party. This objective needs the player's own act: present the situation and the choice, then stop — do not resolve it for them.
[Scene: aegis_guild_hall. Present: Tobias, Belle, Dalan, Ellie.]

RECENT CHAT:
Adolion Narrator: You came to Aegis City to make a name with a blade, a bow or a spell, and three days ago you signed the Adventurers' Guild register to do it. Your Guild badge is new, your purse is light, and you have no party yet. The Guild sends no one out alone.
Today the hall is loud enough to be heard from the street. At the counter, Tobias, who hands out the Guild's work, has set a register beside the quest board and keeps tapping one notice: Wendhope, a mining village in the north that has gone silent, offering more coin than a collapsed mine should be worth.
Two others are looking for a party too. Belle, a barbarian out of the Mountains of Shadow with a greataxe as tall as she is, leans in the tavern arch and makes no secret of being bored. Dalan, a quiet elf archer who has drifted between parties for a year, pretends to read the notices. Beside Tobias, Ellie keeps glancing from those two to you, pen already inked to write a new party's name into the Guild's book.
What do you do?

Player: I wander over to the counter and nod at Tobias. What's on the board that pays and won't get us killed?

=== REPLY A ===
Tobias straightens as you approach, his ocean-blue eyes scanning you with quiet appraisal before meeting your gaze. "A prudent question, though I'm afraid the board is rarely kind." He gestures with a long, pale finger toward the notices, his voice warm but professional. "Most D-rank work is stable enough—rodent infestations in granaries, clearing overgrown paths. Low risk, low reward."

His finger stops just short of the Wendhope posting, tapping the wooden board beside it instead. "This one," he says, finally indicating the notice about the silent mining village. "It pays exceptionally well for D-rank. The Sheridans are funding it personally." His expression remains stoic, but his eyes narrow slightly. "Normally that's a sign to take it immediately. But..." He trails off, his gaze shifting to the fine print. "The Sheridans rarely overpay for simple collapsed shafts or common troubles."

Behind him, Ellie glances over, her quill poised. "It does need a party, though," she adds brightly, her gaze flickering toward Belle in the arch and Dalan by the board. "A full team of three would be perfect for it. Has anyone considered..." She pauses, already seeming to match them in her head.

=== REPLY B ===
Tobias straightens behind the counter, the Wendhope notice still pinned beneath his fingertips. "Ah—good afternoon," he says, with the careful warmth of a man who has rehearsed pleasantries until they sound genuine. "What pays and won't get you killed is a relative question. The miller in Raltdorf needs someone to escort his grain cart to the capital. D-rank. Four silver. Alive, you keep all of it." He pauses, then taps the Wendhope notice again, as if it had pulled his hand. "But if you're asking what *interests* me—"

He flips the notice, revealing the back: a rough map of the Sheridan lands, a mine, a village drawn in small squares behind a wall.

"—Wendhope. A mining settlement. No ore for three weeks. No word from anyone. The Sheridans want to know why, and they're paying D-rank coin for a D-rank problem." His ocean-blue eyes settle on Max. "The math doesn't balance. Collapsed shaft doesn't explain silence that long. Something is wrong, and the posting knows it."

From the tavern arch, Belle's voice cuts across the hall: "So pick the loud one and go already."

=== REPLY C ===
"The question I am always asked," *Tobias says with a faint, knowing smile, straightening a stack of papers.* "Safety and coin rarely occupy the same posting. But for a new registration..." *His finger taps the Wendhope notice.* "This one pays exceptionally well for D-rank. Too well, perhaps." 

*He looks Max over with a measured eye.* "The Sheridans do not throw coin around lightly. It suggests the situation is more complex than a simple collapsed shaft. But remember—you will need a party to take any posting, especially one that smells of trouble. The Guild doesn't send out lone adventurers."

=== REPLY D ===
"A tall order, I'm afraid," *Tobias says, straightening the ledger before his ocean-blue eyes meet Max's.* "Most quests that pay well carry risks in equal measure." *He gestures to the Wendhope notice with a slender finger, tapping it thoughtfully.* "This one has unusual funding from House Sheridan, which means higher coin—but that also suggests the situation is more complicated than a simple collapsed shaft."

*A slight crease appears between his brows as he glances toward the tavern arch.* "You would need a party, of course. The Guild will not send a lone adventurer, and certainly not into a zone where communication has ceased entirely."

```
