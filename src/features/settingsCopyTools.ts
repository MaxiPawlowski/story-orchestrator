export interface SettingCopy {
  label: string;
  help: string;
}

export const copy = (label: string, help: string): SettingCopy => ({ label, help });

export const SETTING_COPY_TOOLS = {
  "copilot.enabled": copy(
    "Enable the wizard",
    "Turns on the story wizard in the Studio and the author's suggestion tools. It uses your authoring model and costs calls only while you use it.",
  ),
  "copilot.ask": copy(
    "Ask questions",
    "Ask in Help, the wizard or /story ask. It only reads; while you play it knows only what you have seen. A few model calls per question.",
  ),
  "worldInfo.gatingMode": copy(
    "How story lorebook entries switch on",
    "Per chat (the default): entries rest off in their lorebook files and each chat sees its own story's entries switched on. "
      + "File writes: entries are switched on and off in their lorebook files as a chat moves.",
  ),
  "worldInfo.scanMemory": copy(
    "Memory text can trigger lore",
    "Established facts, scene history and the current guidance join every lorebook scan, so an entry whose keys they mention can activate. "
      + "What characters privately know never joins it.",
  ),
  "worldInfo.lateLore": copy(
    "Per-turn lore after the history",
    "Story lorebook entries that come and go turn by turn (keyword and lore-select picks) are placed a few messages from the end of the chat instead of beside the character card. "
      + "Their text and order stay the same; the start of the prompt stays the same from turn to turn, so a local model can reuse it and answer sooner.",
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
  "stagecraft.meanwhileAcceptMode": copy(
    "Off-stage events",
    "For stories whose characters have plans: when the story moves on or a scene ends, the memory model proposes one short thing a character did off stage toward that plan. "
      + "Automatically: each one is accepted at once and reaches only that character at the next reply. I accept each one: it waits for you in Author view. Do not propose: no calls are made.",
  ),
  "stagecraft.livingEnabled": copy(
    "Living stories write ahead",
    "For a story with a living premise: when play reaches its last written turning point, the story director writes the next one from the premise, the canon and "
      + "the threads you opened. It never writes behind you or into memory, and a swipe takes back what a reply led to. Off: a living story stops at its last turning point.",
  ),
  "stagecraft.branchingEnabled": copy(
    "Branch when the player goes off script",
    "When what you commit to doing fits none of a turning point's ways forward (the judge says so twice in a row, or once with near certainty), the story director writes a short "
      + "branch that follows you and rejoins the story further on. Questions and refusing a route never branch by themselves. At most one branch per turning point; a swipe takes it back.",
  ),
  "stagecraft.prefetchEnabled": copy(
    "Prepare one more way forward",
    "When you reach a turning point that has ways forward, the story director writes one more way out of it in the background, before you need it, so going "
      + "off script finds a road already there. Only for the turning point you are at, never further ahead, and it counts as that turning point's one branch. "
      + "Needs branching on.",
  ),
  "stagecraft.createEnabled": copy(
    "New lorebook entries",
    "The curator may also propose a NEW keyed entry for a person, place, group or thing that at least two established facts name and no entry covers yet. "
      + "Only in the lorebooks the story lists, never beside an excluded or checkpoint-switched entry, at most the story's limit per chat. "
      + "Every new entry waits for you, whatever the curator setting, and a rollback deletes it unless you edited it. Its model is the Lore creation task.",
  ),
  "stagecraft.createRequireMeasured": copy(
    "Only on a measured model",
    "Propose new entries only when the Lore creation model has passed the create measurement. Off: any model may propose, and the card says it is unmeasured.",
  ),
  "stagecraft.wardenEnabled": copy(
    "Continuity warden",
    "After each character reply, the judge checks it against the story's established facts and scanned lore; when it breaks one, the next reply's prompt restates it once. "
      + "This switch covers only that continuity check. The other reply checks (your part, house rules, attention, voice, ideas) share the same warden call "
      + "under their own judge use switches, so warden calls can still appear with this off. "
      + "Needs the judge. Sends the reply, up to 40 facts and the tracked values.",
  ),
  "stagecraft.wardenAcceptMode": copy(
    "Warden notes",
    "Ask me first: you approve each note. Add them on their own: notes go into the next prompt without you seeing them.",
  ),
  "stagecraft.agencyAcceptMode": copy(
    "Notes about the player's part",
    "When a reply writes what only you do, say or decide, or ignores what you just said, the next reply's prompt carries a one-line reminder. "
      + "Add them on their own (the default): the reminder goes in without anyone approving it. Ask me first: it waits like the other notes. "
      + "Only replies are checked; your own messages are never changed.",
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
    "Which provider answers this use. A provider that was not measured for a use is refused, and the use takes its usual path. "
      + "The attention and voice checks share the warden's call, so they take the warden's provider and have none of their own.",
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
    "Lets stories and the automation below draw pictures through SillyTavern’s configured image backend. An image-prompt model is optional; without one, a template uses the current scene.",
  ),
  "image.backend": copy("Image backend", "Use SillyTavern’s configured Image Generation service, or advanced ComfyUI recipes through the optional media plugin."),
  "image.automation.mode": copy(
    "When pictures are drawn",
    "Story: at the moments each story asks for. Every N: every few of your turns, plus those moments. Model requests: when the model asks. Manual: only when you ask.",
  ),
  "image.automation.everyN": copy(
    "Every N turns",
    "Draw a picture on the first reply of every this many of your turns (the greeting never counts). Lower draws more often and keeps the GPU busier.",
  ),
  "image.automaticRoute": copy(
    "How automatic scene pictures are drawn",
    "Auto: when every visible character (one or two) has a prepared current look, draw from their reference pictures with the Qwen edit route; "
      + "otherwise SDXL from tags. SDXL: always tags. References: only from reference pictures, skipping the picture when that is not possible. "
      + "Auto is still being compared with SDXL in a blind pilot; choose SDXL to keep the earlier behaviour.",
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
  "image.purposes.*.checkpoint": copy("Model",
    "The ComfyUI model this kind of picture uses. Left on automatic, it uses the one installed model of the recipe family; with none or several, Setup asks you to choose."),
  "image.purposes.*.family": copy("Recipe family", "Choose the workflow family supported by your installed checkpoint. A file name alone does not identify its architecture."),
  "image.purposes.*.quality": copy("Quality", "Base is faster; hires adds an upscale pass and takes longer."),
  "image.purposes.*.aspect": copy("Shape", "The picture's proportions. Auto lets the image-prompt model choose."),
  "image.purposes.*.shot": copy("Framing", "How close the camera is: from a close-up to a wide view."),
  "image.purposes.*.placement": copy("Where it appears", "In the message, as its own message, or as the chat background."),
  "image.purposes.*.candidates": copy("Pictures to choose from", "Draw this many and keep the best. Each extra one costs another render."),
  "image.purposes.*.directorMayOverride": copy("Let the image-prompt model pick another model", "The image-prompt model may switch this picture to a different image model when it fits better."),
  "image.purposes.*.extraPositive": copy("Always add", "Words added to every prompt of this kind."),
  "image.purposes.*.extraNegative": copy("Always avoid", "Words added to the avoid list of every prompt of this kind."),
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
  "sprites.effects": copy("Stage effects",
    "Full: characters step in and out, hop when they start speaking, react to expression changes, sway at rest, and the stage fades "
      + "between scenes, darkens with tension and shows a card on a new chapter. Calm: fades, scene transitions, the tension vignette "
      + "and the chapter card only. Off: none of it. Reduced motion in SillyTavern or your system, and a story that switches motion off, keep only short fades."),
  "sprites.breathing": copy("Idle breathing", "A slow, small movement so sprites do not look frozen. Turn it off to save a little work on slow machines."),
  "sprites.liveHead": copy("Live close-shot head",
    "Animates a close shot when this member's look has a rig: breathing, blinks, gaze, body sway, swinging hair locks and small gestures. "
      + "Expressions show the pack's own expression sprite on the same rig when it lines up with the neutral one. "
      + "Falls back to the static sprite. Reduced motion and the story's motion setting stop movement."),
  "sprites.liveHeadFrames": copy("Drawn eyes and mouth on the live head",
    "Uses this look's blink and mouth frames for closed eyes and mouth shapes on a live close shot. Without mouth frames the head moves its own lips only a little."),
  "sprites.blink": copy("Blink", "Uses eyes-closed frames when the sprite pack has them. Reduced motion switches this off."),
  "worldInfo.lorePins": copy("Lore for where you are",
    "Adds the lore entry a story binds to the current place, and to a place or person just met, to the next replies, even when no keyword names it. "
      + "An entry the story keeps switched off, or one that would give away a secret, is left out."),
  "memory.historyNotes": copy("Time and place notes (trial)",
    "Adds a short note of the day and place to the first message after the scene or the time of day changed, in the prompt only. On since its blind rating passed."),
  "memory.outwardNarration": copy("Narrate only what can be seen (trial)",
    "Asks a narrator that sees the cast's private aims to show feelings through speech and action, never as reported thoughts. On since its blind rating passed."),
  "talk.swipeContrast": copy("Swipes see the reply they replace (trial)",
    "When you swipe for a new reply, the visible text of the reply you threw away is shown once, marked as rejected, so the new reply differs. Off until it is rated."),
  "sprites.cardOverlay": copy("Current character state in replies",
    "Adds this story’s applied public changes to the next reply prompt. Character cards and personas stay unchanged."),
  "sprites.poses": { label: "Pose library", help: "Choose body poses from scene directions, sticky keywords and reply picks. Bodies render when needed." },
  "sprites.onDemand": copy("Generate changed looks when needed",
    "Uses the Studio builder’s saved reference setup to edit the current expression when a public look changes. Needs the media plugin and ComfyUI. The current sprite stays visible while rendering."),
  "sprites.mouth": copy("Mouth movement",
    "Moves the speaking character’s mouth with the words while replies stream (English text read as mouth shapes, no audio). "
      + "Simple, the default, opens the closed/open frames on vowels. Smooth also uses the pack's half-open, rounded (oh) and wide (ee) frames, nearest frame when one is missing. "
      + "Off keeps the mouth still. Reduced motion switches this off."),
  "sprites.renderPreset": copy("Render preset",
    "The size and steps the Studio sprite builder starts with. Standard renders at 1024 px with 25 steps; Fast preview at 512 px with 20 steps, quicker but softer."),
} as const satisfies Record<string, SettingCopy>;
