export const TOUR_COPY = {
  title: "Take a tour",
  intro: "Pick one. Each tour points at the real controls, one at a time. Nothing changes unless you click something yourself.",
  player: "Playing a story",
  author: "Writing stories",
  setup: "Setting up",
  label: "Tour",
  stepOf: "Step {n} of {total}",
  back: "Back",
  next: "Next",
  done: "Done",
  skip: "Skip tour",
  close: "Close the tour",
  looking: "Looking for it on screen…",
  missing: "This is not on screen right now.",
  hidden: "This is on the page but hidden right now.",
} as const;

export interface CoachStopCopy {
  title: string;
  text: string;
  missing: string;
  alt?: string;
}

export const COACH_COPY: Readonly<Record<string, CoachStopCopy>> = {
  "player.workspace": {
    title: "Open Story Orchestrator",
    text: "The route icon in the top bar opens Story Orchestrator for this chat. Extensions → Story Orchestrator → Open Story Orchestrator opens it too.",
    missing: "The top bar has no route icon yet. Reload SillyTavern if the extension was installed a moment ago.",
  },
  "player.library": {
    title: "Find or import a story",
    text: "Orchestrator → Library starts a story: import one, build one with the wizard, or continue a chat you already play.",
    missing: "The Library did not open. Close any other window and try again.",
  },
  "player.play": {
    title: "The Play page",
    text: "This story → Play shows where you are, what is still open and how to restart. It speaks for this chat only.",
    missing: "The Play page did not open. Close any other window and try again.",
  },
  "player.memory": {
    title: "What the story remembers",
    text: "Open this to see what the story remembers from your chat. Each character is only told what they could know.",
    missing: "It appears once a story plays in this chat. Start one from the Library first.",
  },
  "player.repair": {
    title: "When something is missing",
    text: "If the story cannot play as set up, this card says what will not happen, and Show me takes you to the fix.",
    missing: "Nothing is missing right now, so there is no repair card. When one appears, a chip on the strip above the chat box opens it.",
  },
  "player.hud": {
    title: "The strip above the chat box",
    text: "This strip shows the current scene and at most one state. Click it for the story card: your journal, ideas for your next move, what the story remembers, and More… for the Play page.",
    missing: "The strip shows while a story plays in this chat. It can be switched off under Orchestrator → Interface.",
  },
  "player.help": {
    title: "Help and these tours",
    text: "Orchestrator → Help has the guide, Ask and these tours. You can also type /story tour in the chat box.",
    missing: "The Help page did not open. Close any other window and try again.",
  },
  "author.author-view": {
    title: "Author view",
    text: "Author view shows how the story works inside, for this chat only. It spoils the story, so it asks first.",
    alt: "Author view is on for this chat. These tabs show the story's state, what runs in the background and the next prompt.",
    missing: "Open a chat that plays a story first; Author view is per chat.",
  },
  "author.review": {
    title: "Review proposals",
    text: "Lorebook changes and continuity notes wait here for you. What you accept applies at the end of the next reply.",
    alt: "Proposals show here once Author view is on for this chat.",
    missing: "Open a chat that plays a story to see its proposals.",
  },
  "author.wizard": {
    title: "Build a story with the wizard",
    text: "New story (wizard) asks about your idea, then proposes the story, its cast and its lore. Nothing is created until you accept it.",
    missing: "The Library did not open. Close any other window and try again.",
  },
  "author.studio": {
    title: "The Studio",
    text: "Open Studio edits a story: its turning points, cast, lore, presentation and features.",
    alt: "This chat plays a story, so the Studio opens once Author view is on. Turn it on here.",
    missing: "The Library did not open. Close any other window and try again.",
  },
  "author.studio-wizard": {
    title: "The wizard inside the Studio",
    text: "The Wizard tab builds or fixes a story step by step. Ask answers questions about how stories work.",
    missing: "The Studio did not open. Open it from Orchestrator → Library → Open Studio.",
  },
  "author.validation": {
    title: "Validation",
    text: "Validation lists what would stop the story or weaken it, with where to fix each one. Save once it is clear.",
    missing: "The Studio did not open. Open it from Orchestrator → Library → Open Studio.",
  },
  "setup.memory": {
    title: "The memory model",
    text: "Pick the model that reads the chat after each reply and moves the story on. It is the one setting a story needs.",
    missing: "The Connections page did not open. Close any other window and try again.",
  },
  "setup.test": {
    title: "Test the memory model",
    text: "Test memory model checks that the model can follow the story and keep track of who knows what. Pick a model first.",
    missing: "The test button shows on Orchestrator → Connections, under the memory model.",
  },
  "setup.judge": {
    title: "The judge (optional)",
    text: "The judge is a small, fast model for short choices, such as who speaks next. Type its key here; SillyTavern keeps it on the server.",
    missing: "The judge settings show on Orchestrator → Connections.",
  },
  "setup.defaults": {
    title: "Feature defaults",
    text: "Every feature is on by default. Each card here is the default for every chat, and off here switches it off everywhere.",
    missing: "The Defaults page did not open. Close any other window and try again.",
  },
  "setup.feature": {
    title: "Tune one feature",
    text: "Each card opens its own controls. Reply thinking, for example, sets how long characters think before they answer.",
    missing: "The card did not open. Find it on Orchestrator → Defaults.",
  },
  "setup.path": {
    title: "The setup path",
    text: "The setup path lists every part in order, with what it costs and how to check it works. Each row has its own Show me.",
    missing: "The guide did not open. Open it from Help → Open the guide.",
  },
};
