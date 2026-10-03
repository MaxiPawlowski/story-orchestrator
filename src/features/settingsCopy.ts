export interface SettingCopy {
  label: string;
  help: string;
}

const copy = (label: string, help: string): SettingCopy => ({ label, help });

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
  "extraction.reconciliationMultiplier": copy(
    "Look further back when stuck",
    "When the story seems stuck, the next read looks this many times further back to catch something it missed. Raise it if the story stalls after long replies; "
      + "each step makes that one read bigger.",
  ),
  "extraction.stabilityLag": copy(
    "Wait before reading the newest messages",
    "Leave the newest messages out of a read, in case you often re-roll them. 0 reacts to the newest message straight away; re-rolls are undone either way.",
  ),
  "extraction.profiles": copy(
    "Model for this task",
    "Send this task to a different Connection Manager profile than the memory model, for example a faster model for frequent work or a stronger one for summaries. "
      + "Left on \"Same as memory model\", it uses the memory model.",
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
  "display.hudEnabled": copy(
    "Show story status above the chat input",
    "A one-line strip above where you type: where the story is and how tense things are. Click it to open the story drawer.",
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
    "When a reply carries the character's reasoning, it is also read for what that character means to do. Needs knowledge tracking. Off until it is measured.",
  ),
  "memory.innerBeat": copy(
    "Prepare a private inner beat for the next speaker",
    "After a reply, the memory model writes a short private note of what the likely next speaker wants, handed only to that character. "
      + "At most two extra calls per turn, never while you wait for a reply. Off until it is measured.",
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
  "talk.chain.max": copy(
    "Voices per turn at most",
    "The most characters that may answer one of your messages. Higher makes busier scenes and longer waits.",
  ),
  "talk.chain.stopOnTransition": copy(
    "End the chain when the scene changes",
    "When the story moves on mid-chain, the remaining characters stop, so the next reply starts from the new scene.",
  ),
  "talk.chain.holdExtraction": copy(
    "Wait for the whole reply before reading the scene",
    "Read the chat only after every character in the chain has answered. Off: each voice is read as it lands, so a scene change can interrupt the chain.",
  ),
  "pacing.hintEnabled": copy(
    "Steer the tension",
    "Adds a quiet note to the prompt that nudges the reply toward the story's intended tension: build it up, or let it cool down.",
  ),
  "pacing.alpha": copy(
    "Tension follows the latest scene by",
    "How strongly the newest scene moves the measured tension, from 0 to 1. Higher reacts faster and jumps more; lower is smoother and slower.",
  ),
  "copilot.enabled": copy(
    "Enable the wizard",
    "Turns on the story wizard in the Studio and the author's suggestion tools. It uses your authoring model and costs calls only while you use it.",
  ),
  "worldInfo.gatingMode": copy(
    "How story lorebook entries switch on",
    "File writes: entries are switched on and off in their lorebook files as a chat moves. Per chat: entries rest off and each chat sees its own story's entries. "
      + "Per chat is safer when several stories share an install.",
  ),
  "worldInfo.scanMemory": copy(
    "Memory text can trigger lore",
    "Established facts, scene history and the current guidance join every lorebook scan, so an entry whose keys they mention can activate. "
      + "What characters privately know never joins it.",
  ),
  "stagecraft.curatorEnabled": copy(
    "Lorebook curator",
    "A background helper that reads what has happened and proposes changes to the story's own lorebook. It only touches the lorebooks the story lists, "
      + "proposes rather than writes, and never changes story progress or memory.",
  ),
  "stagecraft.acceptMode": copy(
    "Curator changes",
    "Ask me first: you approve each change. Apply on their own: changes to entries marked {{// so:auto}} land at the next reply, the rest still wait for you. "
      + "Never apply: only show what it would do.",
  ),
  "stagecraft.wardenEnabled": copy(
    "Continuity warden",
    "After each character reply, the judge checks it against the story's established facts; when it breaks one, the next reply's prompt restates that fact once. "
      + "Needs the judge. Sends the reply, up to 40 facts and the tracked values.",
  ),
  "stagecraft.wardenAcceptMode": copy(
    "Warden notes",
    "Ask me first: you approve each note. Add them on their own: notes go into the next prompt without you seeing them.",
  ),
  "judge.enabled": copy(
    "Use the judge",
    "A second, fast model for yes/no and pick-one decisions. Each use can be switched off on its own and says what it sends. "
      + "It never receives character cards, persona text, other chats or the key.",
  ),
  "judge.uses": copy(
    "Judge uses",
    "Each use answers one kind of question for the story. Switch off any you do not want; the story falls back to its usual path.",
  ),
  "judge.provider": copy(
    "Where this use runs",
    "Which provider answers this use. A provider that was not measured for a use is refused, and the use takes its usual path.",
  ),
  "judge.expansion.variants": copy(
    "Outlines per gap",
    "Write this many outlines for each gap in the story and keep the best one. Each extra outline is another run of the story model.",
  ),
  "judge.expansion.pick": copy(
    "Best outline picked by",
    "Who picks the best outline: the judge's score, or the story model.",
  ),
  "image.enabled": copy(
    "Allow automatic illustrations on this install",
    "Lets stories and the automation below draw pictures. Drawing also needs a ComfyUI server and an image-prompt model. Manual images stay available either way.",
  ),
  "image.automation.mode": copy(
    "When pictures are drawn",
    "Story: at the moments each story asks for. Every N: every few replies, plus those moments. Model requests: when the model asks. Manual: only when you ask.",
  ),
  "image.automation.everyN": copy(
    "Every N replies",
    "Draw a picture every this many replies. Lower draws more often and keeps the GPU busier.",
  ),
  "image.directorProfileId": copy(
    "Image-prompt model",
    "The Connection Manager profile that turns the scene and the story's visual direction into a picture prompt. Separate from the chat model.",
  ),
  "image.comfyUrl": copy(
    "ComfyUI address",
    "Where your ComfyUI server listens. When text and image models share a GPU, use the GPU broker for your text profiles.",
  ),
  "image.safeMode": copy(
    "Avoid explicit imagery",
    "Adds safety terms to every picture prompt and skips explicit requests.",
  ),
  "image.purposes.*.checkpoint": copy("Model", "The image model this kind of picture uses."),
  "image.purposes.*.quality": copy("Quality", "Base is faster; hires adds an upscale pass and takes longer."),
  "image.purposes.*.aspect": copy("Shape", "The picture's proportions. Auto lets the image-prompt model choose."),
  "image.purposes.*.shot": copy("Framing", "How close the camera is: from a close-up to a wide view."),
  "image.purposes.*.placement": copy("Where it appears", "In the message, as its own message, or as the chat background."),
  "image.purposes.*.candidates": copy("Pictures to choose from", "Draw this many and keep the best. Each extra one costs another render."),
  "image.purposes.*.directorMayOverride": copy("Let the image-prompt model pick another model", "The image-prompt model may switch this picture to a different image model when it fits better."),
  "image.purposes.*.extraPositive": copy("Always add", "Words added to every prompt of this kind."),
  "image.purposes.*.extraNegative": copy("Always avoid", "Words added to the avoid list of every prompt of this kind."),
  "image.characters.*.appearanceTags": copy("Fixed look", "Image tags that describe this character, used when the story has not described them."),
  "image.characters.*.alwaysTags": copy("Always include", "Tags added to every picture of this character."),
  "image.characters.*.neverTags": copy("Never include", "Tags kept out of every picture of this character."),
  "sprites.enabled": copy(
    "Show character sprites that change expression as replies stream",
    "Shows the speaking characters on a small stage, and changes their expression with the reply. Needs a sprite pack for each character.",
  ),
  "sprites.stage": copy(
    "Show the stage",
    "With Visual Novel mode: only while SillyTavern's /vn mode is on. Always: in every chat that has sprites.",
  ),
  "sprites.profileId": copy(
    "Expression model when the judge is off",
    "Which profile picks expressions when the judge cannot. Same as the image-prompt model by default.",
  ),
  "sprites.focus": copy("Dim whoever is not speaking", "Fades the characters who are not talking, so the speaker stands out."),
  "sprites.breathing": copy("Idle breathing", "A slow, small movement so sprites do not look frozen. Turn it off to save a little work on slow machines."),
} as const satisfies Record<string, SettingCopy>;

export type SettingCopyKey = keyof typeof SETTING_COPY;

export const settingCopy = (key: SettingCopyKey): SettingCopy => SETTING_COPY[key];

export const settingHelp = (key: SettingCopyKey): string => SETTING_COPY[key].help;
