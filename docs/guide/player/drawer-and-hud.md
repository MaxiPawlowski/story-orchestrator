# The story bar, the drawer and the notes under messages

## The story bar

A thin bar above the chat box shows the current scene, for example `◈ The Job Board · tension rising`. Click it to
open the drawer. It can also show:

| Chip | Meaning |
|---|---|
| `N updates next turn` | The story noticed something; it takes effect after the next reply. |
| `catching up…` | The story is re-checking recent scenes. Keep playing. |
| `needs setup` | Nothing is following the story yet. Click it to open the settings. |
| `not keeping up` | Something went wrong reading the scene. See [Troubleshooting](troubleshooting.md). |
| `stepped back` | You swiped, edited or deleted a message and the story moved back to match. |
| `branch — continue?` | This chat is a branch; click to pick the story up here. |

The bar can be switched off under **Display** in the settings.

## The drawer

The story drawer is the route icon in SillyTavern's top bar. In player mode it has two tabs.

**Overview**, top to bottom:

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
