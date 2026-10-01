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
"Good morning," *Tobias says, his ocean blue eyes meeting yours as he leans slightly over the counter.* "I trust you are considering our newest postings. The Wendhope notice is currently our most pressing, and I will be honest with you—the coin is quite significant for a D-rank quest."

*He gestures towards the board with a slender finger, his long pointed ears twitching slightly.* "There are also several lower-rank quests available, such as clearing rats from a warehouse in the Market District and escorting a merchant caravan to the northern outskirts. Those would be safer options for a new party."

*Tobias straightens his upright posture and pauses, his voice warm but cautious.* "But I must inform you that the Guild sends no one out on quests alone. You will need a party before I can sign off on any of these postings. Ellie, my colleague, can help you form one if you wish."

*He glances briefly towards Belle and Dalan, as then tilts his head slightly toward the exit.* "The tavern is right through that archway, should you wish to introduce yourself to others waiting for work."

=== REPLY C ===
Tobias straightens at the counter, pulling a sheet from behind the board with practiced ease. His finger traces the lines without reading them — he has memorized every posting since dawn.

"A generous question. Most don't ask both at once." He sets the sheet flat against the counter and slides a glass paperweight over it. "Let me show you what is reasonable. There is a vermin problem in the Market District — sewer rats, the usual. Pays poorly, but you will come home in one piece." He turns the page. "A farmer near the eastern gate needs a escort to a village for a wedding. F-rank, practically a walk. Two gold silver for the trouble."

He pauses, and his finger drifts — almost against his will — to the Wendhope notice at the top of the stack. He taps it twice, then catches himself and pulls his hand back. "There is also *this*," he says, voice dropping just enough to be quieter than the hall's noise. "Wendhope. Sheridan lands, northern frontier. A mining village stopped sending ore weeks ago, and no one has heard from it since. The Sheridans have put up more than double the standard D-rank payout." He holds your gaze with those ocean-blue eyes, steady and careful. "Which is precisely what makes me suspicious of it. Collapsed shafts do not pay that well. So if it *is* a collapsed shaft, someone is paying you twice over to go in and find out why the miners stopped digging. And if it's not a collapsed shaft—" He lets the silence finish the thought.

=== REPLY D ===
Tobias straightens at the counter, though his blue eyes remain guarded. "Ah, good afternoon," he greets politely, gesturing to the board behind him with one elegant hand. "We have several postings available, though I must emphasize that as a new party, you'll want to start with D-rank quests. Your options include escort work to the farming villages, monster extermination in the outlying forests, and supply runs."

He pauses, then taps a notice at the top of the board with his pen. "However, this one—Wendhope—pays considerably more than standard D-rank work. A mining village that's gone silent, located in the Sheridan lands. They haven't sent ore shipments in weeks, and neighboring villages report no contact."

*There's something off about the pay scale,* Tobias thinks but doesn't say aloud. *The Sheridans don't overpay for simple collapses.*

"Raltdorf is funding it directly, so the coin is good. Though..." He trails off meaningfully. "I would advise caution. A village that goes dark could indicate anything from a cave-in to bandits, to something considerably worse."

Ellie glances over from her paperwork, blue eyes bright with interest as she takes in the interaction.

```
