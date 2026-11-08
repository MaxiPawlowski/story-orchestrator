# The story bar, the story sheet and the story window

While a story plays you see four things: a one-line **story bar** above the chat box, the **story sheet** beside the
chat, the **story window** with everything about this story, and small marks **in the chat** itself (notes under
messages, scene dividers, next-move chips).

<!-- showcase: hud-overview -->

## The story bar

A thin bar above the chat box. On the left, the scene button: the scene's name (for example `The Job Board`) and, when
the story tracks tension, five dots and a word (`calm` up to `peak`). On the right, at most one status chip, a count of
updates waiting, and the story sheet button (an open book).

Click the scene to open the **story card** just above it:

- the scene and one line on what the story is doing, with **Try again** or **Open story settings** when there is
  something to do;
- **You notice**: a line the story wants you to see, when there is one;
- one button per story sheet page (**Journal**, **Stats**, **Ideas**, **Memory** and so on), each opening the sheet on
  that page;
- **Skip ahead**, when it is switched on (see [Skipping ahead](playing.md#skipping-ahead));
- **Story window**, which opens **This chat → Play**.

Escape, the close button or a click anywhere else closes the card; it never covers the box where you type.

The bar can also show:

| Chip | Meaning |
|---|---|
| `Your move.` | The characters have finished and handed the turn to you. **Settings → Display** can hide it. |
| `N updates next turn` | The story noticed something; it takes effect after the next reply. |
| `waiting for a character` | The story's reading waits a few seconds while a character finishes thinking. |
| `catching up…` | Reading the scene is taking longer than usual. Click it for **Try again**, which checks on the running read and never starts a second one. Keep playing. |
| `catching up after your edit` | You edited the last reply: the story stepped back to before it and is re-reading the edited text (a few seconds). A reply sent before then is built from the pre-edit state. |
| `stepped back` | You swiped, edited or deleted a message and the story moved back to match. |
| `not keeping up` | Something went wrong reading the scene. See [Troubleshooting](troubleshooting.md). |
| `needs setup` | The story cannot read the chat yet (for example no memory model is chosen). Click it to go to the setting. |
| `fix setup (N)` | Something stops the story. Click it to open the list on **This chat → Play**. |
| `check setup (N)` | Something weakens the story but it still plays. Click it to open the list on **This chat → Play**. |
| `You went back: continue from here?` | This chat is a branch; click to pick the story up here (see [Branches](playing.md#branches)). |
| `Setting up the story… N of M cast` | The story is saving the cast for this scene in one group update. |
| `Drawing the scene…` / `Preparing a character…` | An illustration or character image is being made; a placeholder above the box where you type shows its progress. |
| `Still working · Ns` | A model call has taken more than ten seconds. The time keeps counting until it finishes. |

Slow buttons (Restart, Update to the latest, Import, Ask, creating a card) stay busy until their work is done.
Clicking again while busy does not start a second copy.

The bar can be switched off in **Settings → Display** (**Show story status above the chat input**), or for this browser
only with the **This device** chip.

## The story sheet

The story sheet is one window with a tab for each page the story has:

- **Journal**: the quests you have found, their steps and progress, what a quest gives you when the story shows it, the
  main line so far, milestones, **Noticed** (what you noticed) and a short log. A log row's **Show in chat** arrow
  scrolls the chat to its message. A quest you have not found is not listed.
- **Here now**: the place and the time of day, who is in the scene with you and how they treat you. "Nobody else
  is here." when you are alone.
- **People & places**: a person or a place appears once you have learned something about it (see [People, promises
  and standing](playing.md#people-promises-and-standing)).
- **Stats**: what you carry, the meters the story shows in the open (the value large, its label beside it), and how the
  story's groups regard you.
- **Story panels**: one tab per panel the story adds (a clock filling up, a quest board, a wall of clues, a map, your
  party, the road so far). A clue wall lists what you have found; a map marks the places you reached, with "you are
  here". Something found at the last turn is marked new, and a meter or clock says how many replies ago it last
  changed. A clue or a panel can carry a button that puts a line in the box where you type (nothing is sent until you
  send it) or offers a roll the story shows in the open.
- **Story-made panels**: a panel page the story brings. It runs shut off from SillyTavern: it sees only what its plain
  panel shows, cannot read your chats or settings or fetch anything, and can only put one of the story's own lines in
  the box.
- **Ideas**: **What could I do?** (see [Stuck? "What could I do?"](playing.md#stuck-what-could-i-do)).
- **Memory**: a few things the story remembers right now, with **Open memory** for the full list.

Open it with the open-book button on the story bar, a page button on the story card, **Story sheet** in the extensions
wand beside where you type, or a page's pop-out button on **This chat → Play**. A story without journal, people or
stats still has **Ideas** and **Memory**.

On a wide window the sheet docks to the right of the chat: drag its left edge to change the width (it is remembered),
or pop it out into a window you can move. On a phone or a narrow window it is a sheet at the bottom, above the box
where you type, with three heights (small, half, full): drag the grip or press it. At half height it stops short of the
last reply, so you can still read it. On a phone a floating panel (Help, the guide) and the bottom sheet never show
together; opening one closes the other.

A swipe or an edit of the reply that finished a quest takes the quest, and whatever it gave you, back with it.
**Journal**, **Stat sheet**, **Story panels** and **Story-made panels** in **Settings → Display** turn each page off
(Story-made panels off shows the plain panel instead), and an author can switch them off for one story.

<!-- showcase: story-sheet -->

<a id="the-drawer"></a>
## The story window

The story window holds everything about this story and every setting. Open it with the route icon in SillyTavern's top
bar, **Story window** on the story card, **Open the story window** in the wand, or **Extensions → Story Orchestrator →
Open Story Orchestrator** (**Story setup and repair** there opens Play at the list of problems). The route icon and the
wand entry reopen the page you last had open on this device (Play the first time).

It has two halves, switched at the top:

- **This chat**, the chat that is open: **Play** and **Story settings** (plus **Review** and **Author** while Author view
  is on).
- **Settings**, every chat on this install: **Library**, **Features**, **Models**, **Judge**, **Images & stage**,
  **World & lore**, **Display**, **Authoring**, **Diagnostics** and **Help**, with **Search all settings** at the top.

The header says where you are ("This chat · Player view", or "Settings · all chats"). Escape or the close button closes
it. On a phone Settings opens on its list of pages, and one back button returns to it.

What you do inside the window answers inside it: "Moment flagged for the author.", an **Undo** after hiding a problem or
excluding a memory, or why a one-click fix did not work. Nothing hides behind the window.

<!-- showcase: workspace -->

### This chat → Play

Everything a player needs, top to bottom:

- **The scene**: its name, the chapter, and one sentence on what the story is doing ("Following along.", "Reading the
  last few messages…"). When pictures are on, **Illustrate scene**, **Portrait** and **Background** sit here too.
- **N things need attention**, only when something does: one line you open to see each problem, what it costs the
  story, a **Show me** button and, where one exists, a one-click fix. Problems that stop the story open on their own;
  before the first message they start under **Before you start**. **Hide** puts away a problem that only weakens the
  story (with an **Undo**); hidden ones wait under **N hidden** with **Show again**. A problem that stops the story
  cannot be hidden. Problems that belong to every chat (a model, a plugin) take you to the right **Settings** page.
- **You**: who you play in this story, once you chose at the start.
- Tabs:
  - **Now**: **Where you are** and how tense things are, **About this story**, **Recently**, **What changed** (or
    **Because of you**: up to five lines on what changed this chapter; "Because you…" appears only when your own words
    decided it), **Open threads**, **Your promises**, **From an earlier story** (when this run carries one on),
    **Your story** (chapters that have ended; click one to read it), **The story so far** (or **This chapter**),
    **Noted** (what takes effect on the next turn) and **What could I do?**
  - One tab per story sheet page (**Journal**, **Here now**, **People & places**, **Stats**, story panels), the same
    pages as the sheet. Each has a pop-out button that closes the window and opens the sheet on that page.
  - **Memory**: everything the story remembers, to search, pin, edit or remove (see [Memory](memory.md)).
- At the bottom: **Story briefing** (when the story has one), **Flag a moment** and **Restart story**, which asks first
  in its own dialog.

In a living story, **Save this run as a story** keeps what you played as a new story in your library, leaving out
turning points you never reached.

With no story in the chat, Play says what is missing ("Open a group chat to play a story.", "Choose a story for this
chat.") and **Open library** takes you to **Settings → Library**.

**Flag a moment** marks the moment for the author ("What happened here?"). It does not change the story.

Your picture choices for this chat (pause automatic pictures, image model, quality, extra visual direction) are under
**Settings → Images & stage → Pictures in this chat**.

### This chat → Story settings

- **Story**: which story this chat plays (**Restart** and **Export** beside it), and which story every new, empty chat
  in this group starts with.
- **Features in this chat**: every feature as a row with its switch, the same list as **Settings → Features**. A chip
  says where its value comes from: **Default**, **Story** (the story turned it off) or **This chat** (your change).
  Open a row to change its options for this chat; reset drops your change. A feature off for every chat says so, with
  a link to turn it on in **Settings → Features**. How the scopes combine: [Settings
  reference](../setup/settings-reference.md#where-settings-live).
- **Author view**: the switch that turns Author view on for this chat (it asks first, because it spoils the story).

The **Tension and pacing** row also holds this chat's **Dramatic shape**.

### This chat → Review and Author

Both belong to **Author view**. **Review** lists proposals waiting for you (lorebook curator changes, continuity
notes). **Author** holds the author tools below.

<a id="author-view-tabs"></a>
## Author tools

**This chat → Author**, once Author view is on, is a run console for the chat it is turned on in. It spoils the
story. **Return to player view** turns Author view off again. Everything a player sees stays on **Play**; Author holds
only what the player view does not show.

**Steer** stays in view on the left (on a phone it is a bar at the top; tap it to open): the turning point (name and
id), the reply count, what the story is doing in words, its agency line, each unmet condition as a readable line
("Guide's trust ≥ 2, now 0 → The confession"), **Suggest**, **Probe**, **Report**, **Advance to**, **Nudge**,
**Edit story**, **New story** and **Update to the latest**. A warning shows here when a character kept out of a secret
is on stage. **Suggest**, **Report** and **Nudge** need the wizard switched on.

Beside it, one section at a time, each named after the question it answers:

- **Health**: what the story requires and where each lorebook comes from, **Fix with wizard**, the setup checks in one
  line (**Open setup** goes to the full list) and the history floor.
- **State**: every tracked value in one table grouped as Gates, Authored, Character life, Clock, Factions and Compiled,
  with a search box and group chips. A value that changed at the latest reply is highlighted; each row says at which
  reply it last changed, and **Evidence** opens the quoted line it was read from. Below: pending writes, tension,
  convergence, the scene read, character life and factions.
- **Memory**: **Who knows what**, each held secret against each cast member (knows, kept out, not told) and who is on
  stage, then the story's memory with its author extras, conflicts, rumors, echoes and patterns.
- **Prompt**: the lore that fired, scan gating, the sampler overlay, **Next reply** (each contributor to the next reply
  in SillyTavern's order, its depth and size, lines marked private for the character drafted) and the blocks the story
  added to the last prompts.
- **Proposals**: the lorebook curator's and the living story's proposals, the one place to accept or reject them. Its
  tab shows how many wait. **This chat → Review** opens this section.
- **Activity**: what the machine did behind each recent message, rolls included, with chips to show one kind; author
  moves, speaker direction, stall re-checks, stuck-player leads and a refused route. Each **#N** goes to its message.
- **Pipeline**: the model calls, the chat reads, the road ahead (**Regenerate** a failed one), the inner voice and
  chapter seals.

**Illustrate prepared cast** sits below (draw one or two prepared characters together in their current looks), and,
when the story generated sprites, **Remove generated sprites**.

### Inspector

At note level Author or Raw the line under each message carries an **Inspect** link, which opens the inspector beside
the chat, so the chat stays in view. It shows one message: **What changed** (each value before and after, and whether
a read, code or the engine wrote it), **Why** (the turning point the story moved to and the condition that opened it,
or the conditions still unmet), **Prompt** (the story blocks sent for that reply), **Health**, then the other notes.
**‹ ›** step to the previous or next message the story recorded something for. Raw data shows only at Raw. **Open in
Author page** opens the console.

A story that never moves usually has a condition the chat cannot answer: Steer names it with the value it holds now,
and **State** shows the evidence each value was read from.

## Notes under messages

Under a reply the story did something for, one quiet line of words says what, for example "The story moved on ·
Remembered 2 things". Hover a part to see what kind of note it is; click the line to open the notes, grouped by kind.

| Kind | About |
|---|---|
| Progress | The story moved on, or what it is waiting for. |
| Memory | Something the story will remember. |
| Threads | A story thread opened or was resolved. |
| World Info | Lorebook entries used for this reply. |
| Cast & direction | Who joined, left, or was chosen to speak. |
| Pacing | How tense the scene is. |
| Model calls | Background model calls made for this reply. |
| Health | Something did not work as it should. |

Inside an open note a spinner means in progress, a clock means waiting for the next reply, a check means done, and a
crossed circle means not applied.

When the story enters a new chapter, a title card with the chapter's name appears under that message, headed by what
changed in the chapter that just ended. When the story rolls a check it chose to show you, the roll sits under the
reply it decided, for example "Climb: 15 + 4 vs 12, success"; a swipe or a reopened chat shows the same roll. In Author
view at Behind the scenes or higher, every other dice roll and background draw also shows as a chip under its message.
**Dice chips under messages** in **Settings → Display** turns them off.

**Notes under messages** in **Settings → Display** (or **This device**, for this browser only) chooses how much you see:

| Level | Shows |
|---|---|
| Off | Nothing. |
| Story (default) | Where the story moved and what it remembered. |
| Behind the scenes | Also what the story is keeping track of in the background. Still no spoilers. |
| Author, Raw | Everything, with details and actions (Raw: unfiltered). Only while Author view is on. |

Story and Behind the scenes never show spoilers. The same page has the meaning of each kind beside the level picker,
limits notes to the last N messages, and lets you untick kinds you do not want. In Author view the story card also
holds the level for this chat.

<!-- showcase: inline-notes -->

## Between and around the replies

A few small things sit in the chat itself, each with its own switch under **Settings → Display → Between and
around the replies**. They follow **Notes under messages**: at Off none of them show.

- **Scene and time dividers.** A thin labelled line above the message where the story's clock moves on ("Day 3,
  evening") or a new scene starts.
- **"Because you…"** A short line under the reply where something you did clearly made a story step happen. When the
  story is not sure it was you, it shows nothing.
- **Journal cards.** A small card under the reply where a person or place first goes into your journal ("New in your
  journal"), or where you learn more about one. **Open** shows it in the story sheet.
- **Next-move chips.** Under the last reply: **Your move** when the turn is yours, the story's own suggestions for this
  scene, and **Ideas**. Clicking a suggestion puts it in the box where you type; nothing is sent. If you have started
  typing, it leaves your text alone.
- **Gate meter** (Author view, at Author level). Under each reply: how close each way out of the turning point was after
  it ("1 of 2"), what is still missing, and where the story moved.

A swipe, edit or delete of a reply takes back whatever that reply caused, and its marks go with it.

<!-- showcase: in-chat-elements -->

## Characters on stage

When a story directs the stage and the characters have sprites, the speaking characters stand beside the chat, their
faces following the reply: an expression for each reply, blinking, breathing and a mouth that moves while the reply
streams. A character with a prepared live head also turns, looks around, nods while talking and reacts when their
expression changes. Close shots, looks that change during the story and generated sprites are set up by the author or
in [Sprite packs and changed looks](../setup/sprites.md).

The stage starts on **Automatic**: it shows when the story directs it and stays off otherwise. **This chat → Story
settings → Character stage** changes it for this chat; **Settings → Display → This device** changes how this browser
shows it (visibility, dimming, breathing, blinking, mouth movement). Reduced motion in your system, or a story's motion
switch, stops the movement.

<!-- showcase: live-characters -->

## The thinking pill

When the model thinks before a reply, SillyTavern's "Thought for …" bar shows as a small rounded pill at the top
left of the reply. Click it to open or close the thinking; its buttons show only while it is open. **Show the model's
thinking as a small pill** in **Settings → Display** (or **This device**) switches back to SillyTavern's full-width
bar. It applies in every chat, story or not.

## Regenerate after a story note or picture

In a group chat SillyTavern's Regenerate stops at the first system row from the end. When the last rows are the story's
own scene note or picture (posted when a scene changes or an image is placed as its own message), Regenerate removes
them first, so the reply above them is regenerated instead of a new round being added under them. Rows you or other
extensions posted are left alone. **Regenerate removes the story's own note or picture first** in **Settings → Display**
switches this off. The `/regenerate` command still runs SillyTavern's own Regenerate unchanged.

## The wand menu

The extensions wand beside where you type offers, while a story plays: **Story sheet**, **Story recap**, **Story
briefing** (when the story has one), **Flag this moment**, **Open the story window** and **Help** (the feature list with
its Ask box). **Story entries in the wand menu** in **Settings → Display** removes them.

---

[Playing a story](README.md)
