# The story bar, the story window and the notes under messages

While a story plays you see three things: a one-line **story bar** above the chat box, the **story window** with
everything about this story, and small **notes under messages**.

## The story bar

A thin bar above the chat box shows the current scene, for example `◈ The Job Board · tension rising`. Click it to
open the **story card** just above it: the scene, one line on what the story is doing, and buttons for **Open the
journal** and **What could I do?** (when the story has them), **What the story remembers** (a short peek, with
**See all**) and **More…**, which opens the story window at **This chat → Play**. Escape, the close button or a
click anywhere else closes the card; it never covers the box where you type. The bar can also show:

| Chip | Meaning |
|---|---|
| `N updates next turn` | The story noticed something; it takes effect after the next reply. |
| `catching up…` | The story is re-checking recent scenes. Keep playing. |
| `catching up after your edit` | You edited the last reply: the story stepped back to before it and is re-reading the edited text (a few seconds). A reply sent before then is built from the pre-edit state. |
| `fix setup (N)` | Something stops the story (for example no memory model is chosen). Click it to open the setup list on **This chat → Play**. |
| `check setup (N)` | Something weakens the story but it still plays. Click it to open the setup list on **This chat → Play**. |
| `not keeping up` | Something went wrong reading the scene. See [Troubleshooting](troubleshooting.md). |
| `stepped back` | You swiped, edited or deleted a message and the story moved back to match. |
| `branch — continue?` | This chat is a branch; click to pick the story up here. |
| `Your move.` | The characters have finished and handed the turn to you. |
| `Setting up the story… N of M cast` | The story is saving the cast for this scene in one group update. |
| `Drawing the scene…` / `Preparing a character…` | An illustration or character image is being made; a placeholder above the input keeps its progress visible. |
| `Still working · Ns` | A model call has taken more than ten seconds. The elapsed time keeps updating until it finishes. |

Slow action buttons, including Restart, Update to the latest, Import, Ask and asset creation, stay busy until their
work settles. Clicking again while busy does not start another copy of that action.

The bar can be switched off in **Settings → Display** (**Show story status above the chat input**), or for this
browser only under **This device**.

<a id="the-drawer"></a>
## The story window

Open it with the route icon in SillyTavern's top bar, from **More…** on the story card, from **Open the story window**
in the extensions wand beside where you type, or from **Extensions → Story Orchestrator → Open Story Orchestrator**
(**Story setup and repair** there opens the setup list). It has two
halves, switched at the top:

- **This story**, the chat that is open: **Play**, **Features**, **Review** and **Author**.
- **Orchestrator**, every chat on this install: **Library**, **Defaults**, **Connections**, **Interface** and **Help**.

The header says which half you are in ("This chat · Player view", or "All chats · Install settings"). Escape or
**Close** closes it; on a phone the pages sit in a bar at the bottom and **← Back** steps back.

### This chat → Play

Everything a player needs, top to bottom:

- **Setup**, only when something needs doing: what each problem costs the story, a **Show me** button and, where one
  exists, a one-click fix. Before the first message it starts with **Before you start**, the things that stop the
  story. A problem that only weakens the story has **I know, keep it**, which hides it on this install until you bring
  it back; one that stops the story cannot be hidden.
- **Where you are**: the scene, the place, what is going on, and how tense things are ("The scene is calm." up to
  "Everything is at breaking point."). "What happens next is yours to decide." means the story is waiting on you.
- **About this story**: the story's introduction.
- **Recently**: the scene you just left and the one you are in.
- **What changed** (or **Because of you**): up to five lines on what changed this chapter, such as a place you
  reached, a quest that moved or a milestone. "Because you…" appears only when your own words decided it. A story
  without chapters shows the last 20 turns. `/story recap` shows the same lines.
- **Open threads**: things that are not settled yet.
- **Your promises**: promises you made to a character, in your own words (see [People, promises and
  standing](playing.md#people-promises-and-standing)).
- **From an earlier story**: when this run carries on from one you finished (see [Finished stories](playing.md#finished-stories-and-carrying-a-run-on)).
- **Your story**: chapters that have ended, each with its summary. Click one to read it.
- **The story so far** (or **This chapter**): a short summary.
- **Noted**: things the story picked up that take effect on the next turn.
- **Status**: what the extension is doing right now ("Following along.", "Reading the last few messages…"). When the
  story needs a model, **Open story settings** takes you to **Settings → Models**.
- **Your character in this story**: who you play, once you chose at the start.
- **Save this run as a story**: in a living story, keeps what you played as a new story in your library, leaving out
  turning points you never reached.
- **Beside the chat**: **Open the journal**, **Open the stat sheet** and **Open the story panels** when the story has
  them, and **What could I do?** for a few ideas for your next move (see [Starting, continuing and
  restarting](playing.md#stuck-what-could-i-do)). Each closes the story window and opens its panel over the chat, so a
  suggestion lands in the box where you type.
- **Illustrations — this chat**: **Pause automatic images in this chat**, this chat's image preferences, buttons to
  illustrate the scene, a portrait or a background, and what is being drawn.
- **What the story remembers**: the story's memory, to read, pin, edit or remove (see [Memory](memory.md)).
- **Restart story**, **Story briefing** (when the story has one) and **Flag this moment**.

What you do on these pages answers on the page itself: "Moment flagged for the author.", an **Undo** after excluding
a memory, or the reason a one-click fix did not work. Nothing hides behind the story window.

With no story in the chat, Play says what is missing ("Open a group chat to play a story.", "Choose a story for this
chat.") and **Open library** takes you to **Settings → Library**.

**Flag this moment** marks the moment for the author ("What happened here?"). It does not change the story.

The extensions wand beside where you type also offers **Story recap**, **Story briefing** (when the story has one),
**Flag this moment** and **Open the story window** while a story plays.

### This chat → Settings

One card per feature (speaker direction, story reading, inner voice, illustrations and so on), each with its state:
**Enabled**, **Off in this chat**, **Turned off by this story**, **Off on this install**, or for the character stage
**Automatic: on when the story directs the stage**. Open a card to change it for this chat only; **Reset to
story/default** drops your change. The same cards under **Settings → Features** set the default for every chat.
How the scopes combine: [Settings reference](../setup/settings-reference.md#where-settings-live).

The **Tension and pacing** card also holds this chat's **Dramatic shape**.

### This chat → Review and Author

Both belong to **Author view**, which spoils the story, so they ask before showing anything. **Review** lists
proposals waiting for you (lorebook curator changes, continuity notes). **Author** holds the author tools below.

<a id="author-view-tabs"></a>
## Author tools

**This chat → Author**, once Author view is on, adds tabs for the chat it is turned on in. They spoil the story.
**Return to player view** turns Author view off again. Everything a player sees stays on **Play**; Author holds only
what the player view does not show.

- **Overview**: the engine line (turning point and reply count), pending writes, what the story requires and where each
  lorebook comes from, the scene read, tension and convergence, the history floor, and **New story**, **Edit story**
  and **Update to the latest**.
- **Inspector**: clicking an author note under a message opens this page with that message's full detail on top.
- **Illustrate prepared cast**: draw one or two prepared characters together in their current looks.

- **Recent activity**: what the machine did behind each recent message, rolls included, each linked to its message.
- **Blackboard**: every tracked value, what it becomes next turn, its source and the quoted evidence.
- **Scheduler**: the chat reads, speaker direction, stall re-checks, author moves, the road ahead, and phrases the
  newest reply repeats from at least two of the five replies before it ("Repeating across the last 6 replies: …");
  that count is made in code, calls no model and only reports.
- **Payload**: the blocks the story adds to the prompt, and **Next reply**: each contributor to the next reply in
  SillyTavern's order, its depth and size, and lines marked private for the character drafted.

A story that never moves usually has a condition the chat cannot answer: the Blackboard shows the evidence each value
was read from.

## Journal, stat sheet and story panels

Some stories add panels. Open them from **Beside the chat** on **This chat → Play** (which closes the story window),
from the story card or from the wand menu; each opens over the chat in its own panel you can move and resize. On a
phone a panel sits at the bottom, just above the box where you type, and only the panel you opened last shows; close
it to see the one before.

- **Journal**: the quests you have found, their steps and progress, what a quest gives you when the story shows it,
  the main line so far, milestones and a short log. A quest you have not found is not listed. In stories that keep
  them, the Journal also has **People** and **Places** pages (see [People, promises and standing](playing.md#people-promises-and-standing)).
- **Stat sheet**: what you carry, the meters the story shows in the open, and how the story's groups regard you.
- **Story panels**: a clock filling up, a quest board, a wall of clues, a map, your party's state, the road so far. A clue
  wall lists what you have found; a map marks the places you reached, with "you are here"; a timeline lists the places
  you reached, by chapter. Something found at the last turn is marked new, and a meter, a clock or a party row says how
  many replies ago it last changed. A clue, a place or a panel can carry a button that puts a line in the box where you
  type (nothing is sent until you send it), opens the story window, or offers a roll the story shows in the open, with
  its dice. A story can turn the panels' movement off.
- **Story-made panels**: a panel page the story brings. It runs shut off from SillyTavern: it sees only what its plain
  panel shows, cannot read your chats or settings or fetch anything, and can only put one of the story's own lines in
  the box. A page that tries to open another page is closed at once.

A swipe or an edit of the reply that finished a quest takes the quest, and whatever it gave you, back with it.
**Journal**, **Stat sheet**, **Story panels** and **Story-made panels** in **Settings → Display** turn each off
(Story-made panels off shows the plain panel instead), and an author can switch them off for one story.

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

When the story enters a new chapter, a title card with the chapter's name appears under that message, headed by
what changed in the chapter that just ended. When the story rolls a check it chose to show you, the roll sits under
the reply it decided, for example "Climb: 15 + 4 vs 12, success"; a swipe or a reopened chat shows the same roll. In
Author view at Behind the scenes or higher, every other dice roll and background draw also shows as a chip under its
message. **Dice chips under messages** in **Settings → Display** turns them off.

Inside a note: a spinner means in progress, a clock means waiting for the next turn, a check means applied, a
crossed circle means refused.

**Notes under messages** in **Settings → Display** (or **This device**, for this browser only) chooses how much
you see:

| Level | Shows |
|---|---|
| Off | Nothing. |
| Story (default) | Scene changes, memories, threads, tension. |
| Behind the scenes | Also lore looked up, speaker choices, summaries and problems. |
| Author, Raw | Story internals; only with Author view on. |

Story and Behind the scenes never show spoilers. You can also limit notes to the last N messages, and untick kinds of
note you do not want.

---

[Playing a story](README.md)
