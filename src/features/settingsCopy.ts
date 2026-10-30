import type { FeatureArea } from "./registry";
import { copy, SETTING_COPY_TOOLS, type SettingCopy } from "./settingsCopyTools";

export type { SettingCopy } from "./settingsCopyTools";

export const SETTING_COPY = {
  "extraction.enabled": copy(
    "Let the story move forward on its own",
    "After replies, a second model reads the chat and moves the story on when what it needs has happened. Leave it on unless you want to move the story by hand. "
      + "Costs one call to the memory model every few messages.",
  ),
  "extraction.profileId": copy(
    "Memory model",
    "The Connection Manager profile that reads the chat after replies to track the story and remember what happened. It does not replace your chat model. "
      + "Pick a fast, cheap model; every chat uses this choice.",
  ),
  "extraction.fallbackProfileId": copy(
    "Fallback when it is down",
    "When the memory model stops answering, its work goes to this profile until it answers again; it is checked every few minutes and switched back on its own. "
      + "Leave it empty and the work waits for the memory model.",
  ),
  "extraction.replyEffort": copy(
    "Reply thinking",
    "How long your chat model may think before each reply in a story chat. Medium is a good default: as clean as no limit, and replies start sooner. "
      + "Only applies to llama.cpp setups that think; other backends are left alone.",
  ),
  "extraction.cadence": copy(
    "Read the chat every … messages",
    "How often the memory model reads the chat. Lower reacts faster but calls the memory model more often; higher saves calls and reacts later.",
  ),
  "extraction.stabilityLag": copy(
    "Wait before reading the newest messages",
    "Leave the newest messages out of a read, in case you often re-roll them. 0 reacts to the newest message straight away; re-rolls are undone either way.",
  ),
  "extraction.profiles": copy(
    "Model for this task",
    "Send this task to a different Connection Manager profile than the memory model, for example a faster model for frequent work or a stronger one for summaries. "
      + "Left on \"Same as memory model\", it uses the memory model; the wizard's task uses opencode gpt-6.1-sol when the harness plugin offers it, else a DeepSeek profile when there is one."
      + " Claude Code claude-sonnet-5-5 is the other wizard route.",
  ),
  "extraction.readLayout": copy(
    "Story read line order",
    "A measurement arm: the story read lists its fixed instructions first and the lines that change from read to read (the current scene, what happened, "
      + "open threads and promises, known names, the questions) after them, so a local server can reuse the start of each read. The same lines in a new order. "
      + "Off, today's order, until a live test on the GPU shows the read scores within 0.02 of today's: an exception to every feature being on by default. "
      + "No control yet: a measurement run switches it on.",
  ),
  "extraction.promiseAddressee": copy(
    "Name who a promise to \"you\" is for",
    "A measurement arm: adds one line to each story read, saying that a promise said to \"you\" right after a character spoke is for that character. "
      + "Off until a GPU run shows it helps: an exception to every feature being on by default. No control yet: a measurement run switches it on.",
  ),
  "extraction.routes.*.route.options.effort": copy(
    "Thinking for this task",
    "How long the model may think on this task. Default sends nothing extra; higher can be more careful and costs time and tokens.",
  ),
  "extraction.routes.*.onFailure.profileId": copy(
    "If the harness fails",
    "What happens when the harness cannot answer: pause this task, or send it to a Connection Manager profile instead.",
  ),
  "display.inline.level": copy(
    "Notes under messages",
    "Small icons under the replies: where the story moved, what it remembered, which lore it used. Story shows the basics and Behind the scenes a little more; "
      + "neither shows spoilers. Off hides them.",
  ),
  "display.inline.categories": copy(
    "Show this kind of note",
    "Untick a kind of note to hide its icon under the messages.",
  ),
  "display.inline.window": copy(
    "Only the last … messages",
    "Notes show under this many of the newest messages. Lower keeps long chats light.",
  ),
  "display.announceTransitions": copy(
    "Also post a chat note when the story moves on",
    "Posts a short note in the chat when the story reaches a new turning point. Off by default: the note sits after the reply and stops you swiping that reply.",
  ),
  "display.briefing": copy(
    "Show the story briefing when a story starts",
    "The first time a story starts in a chat, a page shows the author's briefing: the world, who you are, who is with you and how to play. You can re-open it from This story → Play.",
  ),
  "display.briefingDraft": copy(
    "Write a briefing when a story has none",
    "The wizard's model writes one for this chat from the story's opening only, never what comes later. One call per new story in a chat.",
  ),
  "display.playerSetup": copy(
    "Ask who you are when a story starts",
    "When a story says who you play, its start page asks once: keep, choose or create a persona. Off: your current one is kept.",
  ),
  "display.presence.listBadges": copy(
    "Mark story groups in the lists",
    "A small icon beside each group, recent chat and past chat that plays a story. A saga, a story its author marks as one, gets its own icon.",
  ),
  "display.presence.continueList": copy(
    "Your stories list",
    "Under Continue: the chats that play a story, newest first, with where each one is. One click opens the chat.",
  ),
  "display.presence.groupCard": copy(
    "Story card on hover",
    "Hovering or focusing a group's story icon shows the story, its chapter and when you last played it.",
  ),
  "display.presence.chapterCard": copy(
    "Chapter title cards",
    "A full-width card under the message where a new chapter opens, instead of a small note.",
  ),
  "display.presence.wand": copy(
    "Story entries in the wand menu",
    "Story recap, the story briefing (when the story has one), flag this moment and the story window, from the extensions wand beside where you type.",
  ),
  "display.presence.rollChips": copy(
    "Dice chips under messages",
    "A check a story makes public shows its roll under the message it decided (\"Climb: 15 + 4 vs 12, success\"). "
      + "Author view also shows every other roll and background draw, here and in the Activity panel.",
  ),
  "display.presence.journal": copy(
    "Journal",
    "A movable panel with the story's quests: the main line you have reached, side quests and their steps, and a log of what happened. It shows only what you have found.",
  ),
  "display.presence.statSheet": copy(
    "Stat sheet",
    "A movable panel with what the story keeps count of in the open: what you carry and the meters the author made public.",
  ),
  "display.presence.widgets": copy(
    "Story panels",
    "Extra panels a story adds, such as a clock that fills or a board of quests. Only what the author made public shows.",
  ),
  "display.presence.htmlWidgets": copy(
    "Story-made panels",
    "Some stories bring a panel page of their own. It runs shut off from SillyTavern: it cannot read your chats or settings or fetch anything, it sees only what its plain panel shows, "
      + "and it can only put one of the story's own lines in the box where you type. A panel that tries to open another page is closed at once. Switch this off to see the plain panel instead.",
  ),
  "display.presence.suggestions": copy(
    "What could I do?",
    "A button on This story → Play and the wand menu that asks the memory model for a few things you could try next. A suggestion goes into the box where you type; "
      + "nothing is sent until you send it. The request sees only what you have already seen in the story.",
  ),
  "display.hudEnabled": copy(
    "Show story status above the chat input",
    "A one-line strip above where you type: where the story is and how tense things are. Click it for the story card.",
  ),
  "display.yourMove": copy(
    "Show \"Your move.\" when the story hands the turn back",
    "A small chip in the status strip when the characters have finished and handed the turn to you, for the reply now on screen. A swipe or an edit of that reply takes it away.",
  ),
  "memory.chapters.recap": copy(
    "Show \"Previously…\" when a chat opens after a chapter ended",
    "When you come back to a chat whose story finished a chapter, a short recap of that chapter is shown first.",
  ),
  "memory.chapters.seal": copy(
    "Write a record when a chapter ends",
    "For stories that declare chapters: when a chapter ends, its memories are written up as one record. Costs a few memory model calls per chapter.",
  ),
  "memory.chapters.storySoFar": copy(
    "Add the story so far to every prompt",
    "The chapter records ride every prompt as a fixed-size story so far, so long stories keep their past. Uses the budget below.",
  ),
  "memory.chapters.fold": copy(
    "Leave ended chapters' messages out of the prompt",
    "Older chapters are represented by their record instead of their messages, which keeps prompts short in long stories.",
  ),
  "memory.chapters.chronicleTokens": copy(
    "Story so far budget",
    "How many tokens the story so far may take in each prompt. Larger keeps more of the past, and leaves less room for the chat.",
  ),
  "memory.epistemicLedgerCapable": copy(
    "Track what each character knows",
    "The memory model also notes who knows what, and what each character is hiding, so characters do not know things they never saw. "
      + "Turn it off when the self-test says this model cannot do it.",
  ),
  "memory.harvestReasoning": copy(
    "Read characters' reasoning for what they intend",
    "When a reply carries the character's reasoning, it is also read for what that character means to do. Needs knowledge tracking. Not measured yet.",
  ),
  "memory.innerBeat": copy(
    "Prepare a private inner beat for the next speaker",
    "After a reply, the memory model writes a short private note of what the likely next speaker wants, handed only to that character. "
      + "At most two extra calls per turn, never while you wait for a reply. Not measured yet.",
  ),
  "characters.delivery": copy(
    "Tell each character how they word things",
    "A story's voice sheets reach only the character they describe, before that character speaks: how they talk, words that are theirs, words they would not use, "
      + "a rhythm and a line for their mood. Wording only, never what happens. No model call.",
  ),
  "characters.deliveryRepetition": copy(
    "Steer characters off phrases they keep repeating",
    "Phrases a character used in several of their own last six replies, and the habits a story lists for them, are named back to that character alone as something to vary. "
      + "Read from the chat each time, so a swipe or edit changes it. No model call.",
  ),
  "characters.polish": copy(
    "Check replies for off-voice wording",
    "When a reply uses a word its character would not use or keeps repeating a phrase, one call to the Reply polish model rewrites only those sentences, and code checks "
      + "nothing else changed. Never the play model. In this build the result is only recorded for the author; the chat is not changed.",
  ),
  "characters.polishMode": copy(
    "Reply polish mode",
    "Shadow runs the check and records what would change, without touching the chat. Off sends nothing. The automatic rewrite is not built yet.",
  ),
  "characters.polishMaxPerHour": copy(
    "Polish calls per hour",
    "At most this many Reply polish calls in an hour, so a subscription route is not used up. Replies past the cap stay as written.",
  ),
  "characters.cues": copy(
    "Give characters the cues a story authors",
    "When an event a story names happens, or you ask a character directly about one of its topics, that character alone is handed one short cue it may use in its own words. "
      + "Never a posted message and never your actions. No model call.",
  ),
  "characters.echoes": copy(
    "Let past events come back later",
    "When a story names an event and a delay, the character or narrator it names is handed one short cue about it once the delay has passed and the story still fits. "
      + "Used at most once per chat, never a posted message and never your actions. No model call.",
  ),
  "memory.promises": copy(
    "Remember promises you make",
    "When you promise a character something, the story keeps your exact words and reminds only that character, when the scene touches it. "
      + "Adds a few lines to each story read. Not measured yet.",
  ),
  "memory.deferrals": copy(
    "Notice threads you put off",
    "When you put a topic off in your own words (\"later\", \"not now\"), the story marks that thread as put off: it is no longer offered as the current thread, "
      + "your thread list says so, and it is picked up again as soon as you mention it. A character saying later never counts. Adds two lines to each story read. Not measured yet.",
  ),
  "memory.deferredOutOfPrompt": copy(
    "Leave put-off threads out of the prompt",
    "Also leaves a thread you put off out of the open threads the characters are given, until you mention it again. "
      + "Off until a blind rating of the replies passes: it changes what the characters see.",
  ),
  "memory.witness": copy(
    "Note who heard each message",
    "Each story read also names the characters who heard or saw each message, and says unknown when it cannot tell. Nothing uses the record until it is measured. "
      + "Adds a few lines to each story read. Not measured yet.",
  ),
  "memory.rumors": copy(
    "Let rumors travel between characters",
    "In a story that declares rumors, news passes between characters along the channels it authors, after a delay, as hearsay the receiver may doubt. "
      + "No model call. A secret travels only to the one person a story's leak names.",
  ),
  "memory.patterns": copy(
    "Notice story patterns",
    "In a story that declares patterns, an order of events the player saw (two favours for one patron, a failed climb then a successful one) shows the story's own "
      + "callback line in What changed and a hint to the narrator. No model call. A line naming someone not yet met, or a secret, is withheld.",
  ),
  "memory.innerFanOut": copy(
    "Inner beats for",
    "Prepare the beat for the likeliest speaker only, or for the two likeliest. Two costs one more call per turn.",
  ),
  "talk.enabled": copy(
    "Speaker direction in group chats",
    "In a group chat, the story picks the character the scene calls for instead of rotating through everyone. This switch is for this chat only.",
  ),
  "talk.chain.enabled": copy(
    "Several characters may answer one message",
    "In a group chat, more than one character can reply to a single message; the story picks each next speaker and stops when it is your turn. "
      + "Off: one voice per turn.",
  ),
  "talk.keepLastQuestion": copy(
    "Keep one question when a character asks you",
    "When a character is told to turn to you with one question, such as the line right after a story's opening, and the reply asks several, "
      + "only the last question is kept and the rest of the line stays as written. A reply the trim would break is left alone, and thinking is never changed.",
  ),
  "talk.chain.max": copy(
    "Voices per turn at most",
    "The most characters that may answer one of your messages. Higher makes busier scenes and longer waits.",
  ),
  "pacing.hintEnabled": copy(
    "Steer the tension",
    "Adds a quiet note to the prompt that nudges the reply toward the story's intended tension: build it up, or let it cool down.",
  ),
  ...SETTING_COPY_TOOLS,
} as const satisfies Record<string, SettingCopy>;

export type SettingCopyKey = keyof typeof SETTING_COPY;

export const settingCopy = (key: SettingCopyKey): SettingCopy => SETTING_COPY[key];

export const settingHelp = (key: SettingCopyKey): string => SETTING_COPY[key].help;

export interface SettingsAreaCopy {
  label: string;
  oneLine: string;
  doc: string;
}

export const SETTINGS_AREA_COPY: Record<FeatureArea, SettingsAreaCopy> = {
  play: { label: "Playing", oneLine: "Which story this chat plays, and what you see while you play.", doc: "player/playing.md" },
  memory: { label: "Memory", oneLine: "The memory model that reads the chat, and what the story remembers.", doc: "setup/memory-model.md" },
  characters: { label: "Characters", oneLine: "Who answers your messages in a group, and how many at once.", doc: "player/playing.md#who-answers-in-a-group" },
  world: { label: "World", oneLine: "How a story's lorebooks are switched on, and the lorebook helper.", doc: "setup/README.md#story-lorebooks" },
  images: { label: "Images", oneLine: "Optional pictures and character sprites; both need your own image setup.", doc: "setup/images.md" },
  judge: { label: "Judge", oneLine: "An optional fast model for small choices; it never blocks a reply.", doc: "setup/judge.md" },
  authoring: { label: "Authoring", oneLine: "Tools for writing stories.", doc: "author/README.md" },
  setup: { label: "Setup", oneLine: "What SillyTavern features were found, and a copy for a bug report.", doc: "setup/README.md" },
};

export const SETTINGS_ADVANCED_LABEL = "Advanced";

export const settingsGuideLabel = (area: FeatureArea): string => `Read the guide: ${SETTINGS_AREA_COPY[area].label}`;
