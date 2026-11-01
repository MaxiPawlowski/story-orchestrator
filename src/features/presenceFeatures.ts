import type { Feature } from "./registry";
import { authorGuideDoc } from "./guideLinks";
import { drawerAt, settingsAt } from "./where";

export const PRESENCE_FEATURES: readonly Feature[] = [
  {
    id: "regenerate-own-rows", name: "Regenerate past story rows", area: "play", audience: "player",
    oneLine: "In a group chat, Regenerate removes the story's own note or picture left last, then regenerates the reply above it.",
    what: "SillyTavern's group Regenerate stops at the first system row from the end. When that row is the story's own scene note or picture, it is removed first "
      + "and SillyTavern's Regenerate then runs as usual. Rows you or other extensions posted are left alone. This changes SillyTavern's own Regenerate entry.",
    where: settingsAt("#so-regenerate-own-rows", "Display › Regenerate removes the story's own note or picture first"),
    settings: ["display.regenerateOwnRows"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["group-chat"],
    isOn: (settings) => settings.display.regenerateOwnRows,
  },
  {
    id: "in-chat-dividers", name: "Scene and time dividers", area: "play", audience: "player",
    oneLine: "A labelled line between messages where the story's clock moves on or a new scene starts.",
    what: "Above the message where the story's time of day changes, or where a new scene begins, a thin line shows the new time (\"Day 3, evening\") or \"A new scene\". "
      + "It reads the story clock and the scene breaks the story reader found; nothing is sent to the model.",
    where: settingsAt("#so-in-chat-dividers", "Display › Scene and time dividers"),
    settings: ["display.inChat.dividers"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.inChat.dividers,
  },
  {
    id: "in-chat-because", name: "\"Because you…\" lines", area: "play", audience: "player",
    oneLine: "Under the reply where your choice made a story step happen, a short line says so.",
    what: "When the story can tell that something you wrote decided a step (a new place, a quest done, a milestone), a short line under that reply says why. "
      + "It uses the same rules as the recap: when it is not sure, it shows nothing.",
    where: settingsAt("#so-in-chat-because", "Display › \"Because you…\""),
    settings: ["display.inChat.because"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.inChat.because,
  },
  {
    id: "in-chat-chips", name: "Next-move chips", area: "play", audience: "player",
    oneLine: "Under the last reply: the story's suggestions for your next move, one click puts one in the box where you type.",
    what: "At the end of the chat, when it is your turn, small buttons show what the story suggests you could do here, plus Ideas for more. "
      + "Clicking one fills the box where you type; you change or send it yourself.",
    where: settingsAt("#so-in-chat-chips", "Display › Next-move chips"),
    settings: ["display.inChat.chips"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.inChat.chips,
  },
  {
    id: "in-chat-discovery", name: "Journal cards", area: "play", audience: "player",
    oneLine: "A small card under the reply where a person or place goes into your journal.",
    what: "When the story adds someone or somewhere to your journal, or you learn something new about them, a card under that reply names it. Open shows it in the story sheet.",
    where: settingsAt("#so-in-chat-discovery", "Display › Journal cards"),
    settings: ["display.inChat.discovery"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.inChat.discovery,
  },
  {
    id: "in-chat-gate-meter", name: "Gate meter", area: "play", audience: "author",
    oneLine: "Author view: under each reply, how close each way out of the checkpoint was.",
    what: "In Author view, each reply carries a small meter per outgoing transition: how many of its conditions held after that reply, which are still missing, and where the story moved.",
    where: settingsAt("#so-in-chat-gate-meter", "Display › Gate meter"),
    settings: ["display.inChat.gateMeter"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.inChat.gateMeter,
  },
  {
    id: "compact-thoughts", name: "Thinking pill", area: "play", audience: "player",
    oneLine: "SillyTavern's \"Thought for …\" bar becomes a small pill at the top left of the reply.",
    what: "The thinking bar above a reply shrinks to a small rounded label. Click it to open or close the thinking; its buttons show only while it is open. "
      + "This restyles SillyTavern's own message view, in every chat.",
    where: settingsAt("#so-compact-thoughts", "Display › Thinking pill"),
    settings: ["display.compactThoughts"], doc: "player/drawer-and-hud.md", status: "shipped", needs: [],
    isOn: (settings) => settings.display.compactThoughts,
  },
  {
    id: "story-badges", name: "Story marks in the lists", area: "play", audience: "player",
    oneLine: "Groups and chats that play a story carry a small icon in SillyTavern's lists.",
    what: "The group list, the welcome screen's recent chats and a group's past chats mark every chat that plays a story. A saga, a story its author marks as one, "
      + "has its own icon. The marks come from a list of the chats you played, which fills in by itself as you open chats.",
    where: settingsAt("#so-presence-list-badges", "Display › Mark story groups in the lists"),
    settings: ["display.presence.listBadges"], doc: "player/playing.md", status: "shipped", needs: ["group-chat"],
    isOn: (settings) => settings.display.presence.listBadges,
  },
  {
    id: "story-card", name: "Story card", area: "play", audience: "player",
    oneLine: "Hover a group's story icon to see the story, its chapter and when you last played.",
    what: "The card shows only names you have already reached. A story can switch its card off; switching it off here hides it for every story.",
    where: settingsAt("#so-presence-group-card", "Display › Story card on hover"),
    settings: ["display.presence.groupCard"], doc: "player/playing.md", status: "shipped", needs: ["group-chat"],
    isOn: (settings) => settings.display.presence.groupCard,
  },
  {
    id: "continue-list", name: "Your stories", area: "play", audience: "player",
    oneLine: "Under Continue: every chat that plays a story, newest first, one click to open it.",
    what: "Each row names the story, the chapter and place you reached and when you last played. A chat keeps its row while it still plays the story, even after the story leaves your library.",
    where: settingsAt("#so-presence-continue-list", "Display › Your stories list"),
    settings: ["display.presence.continueList"], doc: "player/playing.md", status: "shipped", needs: ["group-chat"],
    isOn: (settings) => settings.display.presence.continueList,
  },
  {
    id: "chapter-cards", name: "Chapter title cards", area: "play", audience: "player",
    oneLine: "A full-width card under the message where a new chapter opens.",
    what: "When the story enters a new chapter, a title card appears under that message with the chapter's name. Swiping that reply away takes the card with it.",
    where: settingsAt("#so-presence-chapter-card", "Display › Chapter title cards"),
    settings: ["display.presence.chapterCard"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.chapterCard,
  },
  {
    id: "story-wand", name: "Story in the wand menu", area: "play", audience: "player",
    oneLine: "Story recap, the story briefing, flag this moment and the story window, from the extensions wand.",
    what: "While a story plays, the wand beside where you type lists a recap of the story so far, a flag for this moment and a shortcut to the story window.",
    where: settingsAt("#so-presence-wand", "Display › Story entries in the wand menu"),
    settings: ["display.presence.wand"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.wand,
  },
  {
    id: "roll-chips", name: "Dice chips", area: "play", audience: "player",
    oneLine: "A check the story makes public shows its roll under the message it decided.",
    what: "\"Climb: 15 + 4 vs 12, success\" sits under the reply the check decided. The roll is drawn from the chat itself, so a swipe or a reopened chat shows the same roll. "
      + "A check the author keeps hidden shows only in the story's telling. Author view also shows every other roll and background draw.",
    where: settingsAt("#so-presence-roll-chips", "Display › Dice chips under messages"),
    settings: ["display.presence.rollChips"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.presence.rollChips,
  },
  {
    id: "activity-panel", name: "Activity panel", area: "play", audience: "author",
    oneLine: "A movable panel listing what the machine did behind each recent message.",
    what: "Story moves, memory notes, lore, speaker picks, model calls and rolls in one list, newest first, each linked to its message. Drag it anywhere; it remembers where you left it.",
    where: drawerAt("#so-open-activity", "Recent activity"),
    settings: [], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story", "author-view"],
  },
  {
    id: "suggestions", name: "What could I do?", area: "play", audience: "player",
    oneLine: "A button that suggests a few things you could try next, and puts the one you pick in the box where you type.",
    what: "Click What could I do? on This chat → Play or the story card above the chat box, or pick it from the wand menu. "
      + "The memory model words four things to try, built on what you already know; a waiting check lists what could help, never dice; in Author view an offer not open yet shows greyed. "
      + "Picking one only fills the box where you type; nothing is sent until you send it, and it never replaces something you started typing. A story can switch the button off.",
    where: drawerAt("#so-open-suggestions", "What could I do?"),
    settings: ["display.presence.suggestions"], doc: "player/playing.md", status: "shipped", needs: ["story", "memory-profile"],
    isOn: (settings) => settings.display.presence.suggestions,
  },
  {
    id: "repetition-readout", name: "Repetition readout", area: "play", audience: "author",
    oneLine: "Author view names phrases the latest reply repeats from the five before it.",
    what: "A short line in the Author page's Proposals section lists phrases, openers and stock constructions the newest reply shares with at least two of the five replies before it. "
      + "Counted in code, with no model call. It only reports; nothing reaches the prompt.",
    where: drawerAt("[data-so=\"repetition\"]", "Proposals › Repetition"),
    settings: [], doc: "player/drawer-and-hud.md", status: "experimental", needs: ["story", "author-view"],
  },
  {
    id: "guide", name: "Guide", area: "setup", audience: "player",
    oneLine: "The whole guide inside SillyTavern: playing, setup and writing stories.",
    what: "Open the guide from Help or with /story guide. Read more in Help opens the page about that feature. Pages about writing stories show only in Author view.",
    where: settingsAt("#so-help-open-guide", "Help › Open the guide"),
    settings: [], doc: "player/README.md", status: "shipped",
  },
  {
    id: "tour", name: "Tour", area: "setup", audience: "player",
    oneLine: "Short tours that point at the real controls: playing, writing stories, and setting up.",
    what: "Take a tour from Help or with /story tour. A small card points at one control at a time, with Back, Next and Skip; nothing changes unless "
      + "you click something yourself. Help › Setup path opens the guide page that turns each part on in order.",
    where: settingsAt("#so-help-tour", "Help › Take the tour"),
    settings: [], doc: "setup/setup-path.md", status: "shipped",
  },
  {
    id: "open-stretches", name: "Open stretches", area: "authoring", audience: "author",
    oneLine: "Free play between two turning points, with no task.",
    what: "An open bridge scene has no goal line. After a few turns the world points toward the next place and, once play goes quiet, may offer small optional encounters; "
      + "the player leaves by their own move. An anchor can open the same way for its first turns.",
    where: { selector: "#so-studio-modal", label: "Studio › Checkpoints", surface: "studio" },
    settings: [], guideTopic: "open-stretches", doc: authorGuideDoc("open-stretches"), status: "experimental", needs: ["story"],
  },
];
