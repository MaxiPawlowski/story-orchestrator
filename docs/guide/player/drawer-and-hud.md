# The story bar, the drawer and the notes under messages

## The story bar

A thin bar above the chat box shows the current scene, for example `◈ The Job Board · tension rising`. Click it to
open the drawer. It can also show:

| Chip | Meaning |
|---|---|
| `N updates next turn` | The story noticed something; it takes effect after the next reply. |
| `catching up…` | The story is re-checking recent scenes. Keep playing. |
| `catching up after your edit` | You edited the last reply: the story stepped back to before it and is re-reading the edited text (a few seconds). A reply sent before then is built from the pre-edit state. |
| `fix setup (N)` | Something stops the story (for example no memory model is chosen). Click it to open the Repair row. |
| `check setup (N)` | Something weakens the story but it still plays. Click it to open the Repair row. |
| `not keeping up` | Something went wrong reading the scene. See [Troubleshooting](troubleshooting.md). |
| `stepped back` | You swiped, edited or deleted a message and the story moved back to match. |
| `branch — continue?` | This chat is a branch; click to pick the story up here. |

The bar can be switched off under **Playing** in the settings.

## The drawer

The story drawer is the route icon in SillyTavern's top bar. In player mode it has two tabs.

**Overview**, top to bottom:

- **Setup**, only when something needs doing: what each problem costs the story, a **Show me** button and, where
  one exists, a one-click fix. Before the first message it starts with **Before you start**, the things that stop
  the story. A problem that only weakens the story has **I know, keep it**, which hides it on this install until
  you bring it back; one that stops the story cannot be hidden.
- **Where you are**: the scene, the place, what is going on, and how tense things are ("The scene is calm." up to
  "Everything is at breaking point."). "What happens next is yours to decide." means the story is waiting on you.
- **About this story**: the story's introduction.
- **Recently**: the scene you just left and the one you are in.
- **Open threads**: things that are not settled yet.
- **Your story**: chapters that have ended, each with its summary. Click one to read it.
- **The story so far** (or **This chapter**): a short summary.
- **Noted**: things the story picked up that take effect on the next turn.
- **Status**: what the extension is doing right now ("Following along.", "Reading the last few messages…").
- **Illustrations — this chat**, when images are set up: pause automatic images, or draw a scene, a portrait or a
  background by hand.
- **Chat preferences — this chat only**: speaker direction in group chats, and the story's dramatic shape.
- At the bottom: **Restart story**, and a Repair button when something is missing.

**Memory**: what the story remembers. See [Memory](memory.md).

The ⚑ button flags a moment for the author ("What happened here?"). It does not change the story.

The ? button opens Help in a panel you can drag, resize and close with Escape; it remembers where you left it.
On a narrow screen it docks along the bottom. While a story plays, the extensions wand beside where you type
also offers **Story recap**, **Story briefing** (when the story has one), **Flag this moment** and **Open the story drawer**.

The lightbulb opens **What could I do?** (see [Starting, continuing and restarting](playing.md)).

In Author view, the list button next to ? opens the **Activity** panel: what the machine did behind each recent
message, rolls included, each linked to its message. The Scheduler tab also names phrases the newest reply repeats
from at least two of the five replies before it ("Repeating across the last 6 replies: …"); it is counted in code,
calls no model and only reports.

## Journal, stat sheet and story panels

Some stories add panels. Open them from the buttons under the drawer's Overview or from the wand menu; each opens in
its own panel you can move and resize.

- **Journal**: the quests you have found, their steps and progress, what a quest gives you when the story shows it,
  the main line so far, milestones and a short log. A quest you have not found is not listed.
- **Stat sheet**: what you carry and the meters the story shows in the open.
- **Story panels**: a clock filling up, a quest board, a wall of clues, a map. A clue wall lists what you have found;
  a map marks the places you reached, with "you are here". Something found at the last turn is marked new. A clue or
  a place can carry a button that puts a line in the box where you type; nothing is sent until you send it.
- **Story-made panels**: a panel page the story brings. It runs shut off from SillyTavern: it sees only what its plain
  panel shows, cannot read your chats or settings or fetch anything, and can only put one of the story's own lines in
  the box. A page that tries to open another page is closed at once.

A swipe or an edit of the reply that finished a quest takes the quest, and whatever it gave you, back with it.
**Journal**, **Stat sheet**, **Story panels** and **Story-made panels** in the settings turn each off (Story-made
panels off shows the plain panel instead), and an author can switch them off for one story.

## Notes under messages

Small icons under each message show what the story did at that point. Click an icon to read its notes.

| Icon | About |
|---|---|
| route | The story moved to a new scene. |
| brain | Something was remembered or summarized. |
| branch | A thread opened or was resolved. |
| book | Lore the story looked up. |
| people | Someone joined, left, or was chosen to speak. |
| heart-pulse | Tension changed. |
| chip | What the memory model noticed. |
| warning triangle | The story stepped back, or had trouble. |

When the story enters a new chapter, a title card with the chapter's name appears under that message. When the
story rolls a check it chose to show you, the roll sits under the reply it decided, for example "Climb: 15 + 4 vs
12, success"; a swipe or a reopened chat shows the same roll. In Author view at Behind the scenes or higher, every
other dice roll and background draw also shows as a chip under its message. **Dice chips under messages** in the
settings turns them off.

Inside a note: a spinner means in progress, a clock means waiting for the next turn, a check means applied, a
crossed circle means refused.

**Notes under messages** in the settings chooses how much you see:

| Level | Shows |
|---|---|
| Off | Nothing. |
| Story (default) | Scene changes, memories, threads, tension. |
| Behind the scenes | Also lore looked up, speaker choices, summaries and problems. |
| Author, Raw | Story internals; only with Author view on. |

Story and Behind the scenes never show spoilers. You can also limit notes to the last N messages.

---

[Playing a story](README.md)
