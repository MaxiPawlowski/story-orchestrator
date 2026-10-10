import { JUDGE_USE_COPY, JUDGE_USE_KEYS, JUDGE_USES_OFF_BY_DEFAULT, AUTHOR_JUDGE_USES, type JudgeUseKey } from "@judge/settings";
import type { GuideTopicId } from "@copilot/guideTopics";
import type { GlobalSettings } from "@runtime/settingsModel";
import { PRESENCE_FEATURES } from "./presenceFeatures";
import { GAME_FEATURES } from "./gameFeatures";
import { LIFE_FEATURES } from "./lifeFeatures";
import { LIVING_FEATURES } from "./livingFeatures";
import { START_FEATURES } from "./startFeatures";
import { chatAt, drawerAt, settingsAt, studioAt } from "./where";
import { IMAGE_FEATURES } from "./imageFeatures";
import { authorGuideDoc } from "./guideLinks";

export const FEATURE_AREAS = ["play", "memory", "characters", "world", "images", "judge", "authoring", "setup"] as const;
export type FeatureArea = (typeof FEATURE_AREAS)[number];

export const AREA_LABELS: Record<FeatureArea, string> = {
  play: "Playing a story",
  memory: "Memory",
  characters: "Characters",
  world: "World",
  images: "Images",
  judge: "Judge",
  authoring: "Authoring",
  setup: "Setup and diagnostics",
};

export type FeatureAudience = "player" | "author" | "setup";
export type FeatureStatus = "shipped" | "off-by-default" | "experimental";
export type FeatureNeed = "memory-profile" | "judge-plugin" | "comfyui" | "group-chat" | "story" | "author-view" | "harness-plugin" | "sprite-pack";
export type FeatureSurface = "settings" | "drawer" | "chat" | "studio";

export const NEED_LABELS: Record<FeatureNeed, string> = {
  "memory-profile": "a memory model",
  "judge-plugin": "the judge plugin and a key",
  comfyui: "a ComfyUI server",
  "group-chat": "a group chat",
  story: "a story in this chat",
  "author-view": "Author view",
  "harness-plugin": "the harness plugin",
  "sprite-pack": "sprite packs for the characters",
};

export interface FeatureWhere {
  selector: string;
  label: string;
  surface: FeatureSurface;
}

export interface Feature {
  id: string;
  name: string;
  area: FeatureArea;
  audience: FeatureAudience;
  oneLine: string;
  what: string;
  where: FeatureWhere;
  settings: readonly string[];
  guideTopic?: GuideTopicId;
  doc: string;
  status: FeatureStatus;
  needs?: readonly FeatureNeed[];
  isOn?: (settings: GlobalSettings) => boolean;
}


const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

const JUDGE_USE_AREA: Partial<Record<JudgeUseKey, FeatureArea>> = {
  director: "characters", expressions: "images", loreSelect: "world", loreExclusive: "world", curatorFilter: "world", wardenLore: "world",
  memoryVerify: "memory", memoryPairs: "memory", sceneTrigger: "memory", sceneTracker: "memory", typedExtraction: "memory", stallCheck: "memory",
  expansionCritic: "authoring", expansionLookahead: "authoring", lookahead: "authoring", agencyCheck: "characters", houseRules: "characters", attentionCheck: "characters",
  wardenVoice: "characters", divergence: "authoring",
};

const AUTHOR_FACING_USES: readonly JudgeUseKey[] = ["lookahead", "curatorFilter"];

const judgeUseFeature = (use: JudgeUseKey): Feature => {
  const copy = JUDGE_USE_COPY[use];
  return {
    id: `judge-use-${kebab(use)}`,
    name: copy.label,
    area: JUDGE_USE_AREA[use] ?? "judge",
    audience: AUTHOR_JUDGE_USES.includes(use) || AUTHOR_FACING_USES.includes(use) ? "author" : "setup",
    oneLine: copy.description,
    what: `${copy.description} Sends: ${copy.sends}.`,
    where: settingsAt(`#so-judge-use-${kebab(use)}`, `Judge › ${copy.label}`),
    settings: [`judge.uses.${use}`, `judge.provider.${use}`],
    doc: "setup/judge.md",
    status: JUDGE_USES_OFF_BY_DEFAULT.includes(use) ? "off-by-default" : "shipped",
    needs: ["judge-plugin"],
    isOn: (settings) => settings.judge.enabled && settings.judge.uses[use],
  };
};

const CORE_FEATURES: readonly Feature[] = [
  {
    id: "stories", name: "Stories", area: "play", audience: "player",
    oneLine: "Play an authored story on top of an ordinary chat.",
    what: "A story is a map of turning points with goals. Pick one for a chat and it follows your play, moving on when what it needs has "
      + "happened. Each chat keeps its own copy, so editing the story never changes a run in progress.",
    where: settingsAt("#story-library-select", "Playing › Story for this chat"),
    settings: [], doc: "player/playing.md", status: "shipped", needs: ["group-chat", "memory-profile"],
  },
  {
    id: "group-binding", name: "Group story", area: "play", audience: "player",
    oneLine: "A group can start every new chat with the same story.",
    what: "Choose a story for a group, and each new chat in that group starts playing it. Existing chats keep whatever they play.",
    where: settingsAt("#so-group-story-select", "Playing › New chats start with"),
    settings: [], doc: "player/playing.md", status: "shipped", needs: ["group-chat"],
  },
  ...START_FEATURES,
  {
    id: "story-drawer", name: "Story drawer", area: "play", audience: "player",
    oneLine: "Where you are, what happened, and what you are remembered for.",
    what: "The route icon in the top bar opens the story drawer. Overview shows where the story is, what happened recently and what is still open; Memory lists what the story remembers.",
    where: drawerAt("#so-player-overview", "Overview"),
    settings: [], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
  },
  {
    id: "hud", name: "Status strip", area: "play", audience: "player",
    oneLine: "One line above the chat input: where the story is and how tense it is.",
    what: "A small strip above where you type shows the current scene and the tension. A chip appears when the story is catching up or needs setup; click it to fix that.",
    where: settingsAt("#so-hud-enabled", "Playing › Show story status"),
    settings: ["display.hudEnabled"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.hudEnabled,
  },
  {
    id: "inline-notes", name: "Notes under messages", area: "play", audience: "player",
    oneLine: "Small icons under replies: where the story moved, what it remembered, which lore it used.",
    what: "Each reply can carry a row of icons. Click one to read what happened behind that reply. The legend button explains each icon. Story and Behind the scenes never show spoilers.",
    where: settingsAt("#so-inline-level", "Playing › Notes under messages"),
    settings: ["display.inline"], doc: "player/drawer-and-hud.md", status: "shipped", needs: ["story"],
    isOn: (settings) => settings.display.inline.level > 0,
  },
  {
    id: "transition-notes", name: "Chat note when the story moves on", area: "play", audience: "player",
    oneLine: "Optionally post a short chat note at each new turning point.",
    what: "Off by default, because the note sits after the reply and stops you swiping that reply. The notes under messages show the same thing without that cost.",
    where: settingsAt("#so-announce-transitions", "Playing › Also post a chat note"),
    settings: ["display.announceTransitions"], doc: "player/drawer-and-hud.md", status: "off-by-default", needs: ["story"],
    isOn: (settings) => settings.display.announceTransitions,
  },
  {
    id: "recap", name: "Recap and welcome back", area: "play", audience: "player",
    oneLine: "Coming back after a break shows where you left off; /story recap asks any time.",
    what: "When you reopen a chat after a while, a short recap says where the story is. Type /story recap for the same at any "
      + "time, /story threads for what is still open, and /story help for every command.",
    where: drawerAt("#so-player-overview", "Overview"),
    settings: [], doc: "player/playing.md", status: "shipped", needs: ["story"],
  },
  {
    id: "branches", name: "Branched chats", area: "play", audience: "player",
    oneLine: "A chat branched from a story keeps going from where the branch ends.",
    what: "When you branch a chat that plays a story, the branch offers to continue the story from there. Swiping, editing or deleting a reply steps the story back with it.",
    where: chatAt("#so-hud-branch", "Status strip"),
    settings: [], doc: "player/playing.md", status: "shipped",
  },
  {
    id: "pacing", name: "Tension and pacing", area: "play", audience: "author",
    oneLine: "Measures the scene's tension and nudges replies toward the story's intended shape.",
    what: "Each turn's tension is measured and compared with what the story expects at this point. A quiet note in the prompt asks the reply to build the tension up or let it cool.",
    where: settingsAt("#so-pacing-hint", "Playing › Pacing"),
    settings: ["pacing"], guideTopic: "tension", doc: authorGuideDoc("tension"), status: "shipped", needs: ["story"],
    isOn: (settings) => settings.pacing.hintEnabled,
  },
  {
    id: "memory", name: "Story memory", area: "memory", audience: "player",
    oneLine: "Remembers what happened so characters stay consistent.",
    what: "After replies, the memory model reads the chat, notes facts and scenes, and moves the story on when its goals are "
      + "met. What it remembers rides the prompt, so characters keep track of what happened.",
    where: settingsAt("#so-extraction-profile", "Memory › Memory model"),
    settings: [
      "extraction.enabled", "extraction.profileId", "extraction.fallbackProfileId", "extraction.cadence", "extraction.stabilityLag",
      "memory.enabled", "memory.injectionDepths", "memory.tierBudgets", "memory.tierTokenBudgets", "memory.scoreWeights",
    ],
    doc: "player/memory.md", status: "shipped", needs: ["memory-profile"],
    isOn: (settings) => settings.extraction.enabled && Boolean(settings.extraction.profileId),
  },
  {
    id: "memory-tab", name: "Memory tab", area: "memory", audience: "player",
    oneLine: "See, search, pin or remove what the story remembers.",
    what: "The drawer's Memory tab lists the established facts. Pin one to keep it in every prompt, or remove one the story got wrong.",
    where: drawerAt("#so-memory-search", "Memory"),
    settings: [], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
  {
    id: "chapters", name: "Chapters", area: "memory", audience: "player",
    oneLine: "Long stories write up each finished chapter and recap it when you return.",
    what: "For stories that declare chapters, a finished chapter becomes one written record. The record can stand in for its "
      + "messages in the prompt, and \"Previously…\" recaps it when you reopen the chat.",
    where: settingsAt("#so-chapter-recap", "Memory › Chapters"),
    settings: ["memory.chapters"], guideTopic: "chapters", doc: "player/memory.md", status: "shipped", needs: ["story", "memory-profile"],
    isOn: (settings) => settings.memory.chapters?.recap !== false || settings.memory.chapters?.seal !== false,
  },
  {
    id: "continuity-warden", name: "Continuity warden", area: "memory", audience: "author",
    oneLine: "Catches a reply that breaks an established fact and restates the fact for the next reply.",
    what: "After each character reply, the judge checks it against the established facts. When the reply breaks one, "
      + "the next reply's prompt restates that fact once, after your approval or on its own.",
    where: settingsAt("#so-warden-enabled", "Memory › Continuity warden"),
    settings: ["stagecraft.wardenEnabled", "stagecraft.wardenAcceptMode", "stagecraft.agencyAcceptMode", "judge.provider.warden"],
    doc: authorGuideDoc("house-rules"), status: "shipped", needs: ["judge-plugin"],
    isOn: (settings) => settings.stagecraft.wardenEnabled && settings.stagecraft.wardenAcceptMode !== "off",
  },
  {
    id: "speaker-direction", name: "Speaker direction", area: "characters", audience: "player",
    oneLine: "In a group, the story picks who should speak next.",
    what: "In a group chat, the story chooses the character the scene calls for instead of rotating through everyone. A story can set who leads each scene.",
    where: drawerAt("#so-talk-direction", "Overview › Chat preferences"),
    settings: ["talk.enabled"], guideTopic: "talk-control", doc: "player/playing.md", status: "shipped", needs: ["group-chat", "story"],
    isOn: (settings) => settings.talk.enabled,
  },
  {
    id: "talk-chain", name: "Several voices per turn", area: "characters", audience: "player",
    oneLine: "More than one character can answer one of your messages.",
    what: "In a group chat, a single message can be answered by several characters in turn; the chain stops when it is your turn again or the scene changes.",
    where: settingsAt("#so-chain-enabled", "Characters › Speaker direction"),
    settings: ["talk.chain"], guideTopic: "talk-control", doc: "player/playing.md", status: "shipped", needs: ["group-chat"],
    isOn: (settings) => settings.talk.chain.enabled,
  },
  {
    id: "private-knowledge", name: "Private knowledge", area: "characters", audience: "author",
    oneLine: "Tracks who knows what, so characters do not know things they never saw.",
    what: "The memory model also notes what each character knows, suspects or hides. Each character's prompt carries only its own knowledge, so secrets stay secret.",
    where: settingsAt("#so-epistemic-capable", "Memory › Advanced › Track what each character knows"),
    settings: ["memory.epistemicLedgerCapable"], doc: authorGuideDoc("drives-motives"), status: "shipped", needs: ["memory-profile"],
    isOn: (settings) => settings.memory.epistemicLedgerCapable,
  },
  {
    id: "inner-voice", name: "Inner voice", area: "characters", audience: "author",
    oneLine: "Characters prepare a private intent before they speak.",
    what: "After a reply, the memory model can write a short private note of what the next speaker wants, handed only to that "
      + "character. It can also read a reply's reasoning for what the character intends.",
    where: settingsAt("#so-inner-beat", "Characters › Inner voice"),
    settings: ["memory.innerBeat", "memory.innerFanOut", "memory.harvestReasoning"], guideTopic: "drives-motives", doc: authorGuideDoc("drives-motives"), status: "shipped",
    needs: ["memory-profile", "author-view"],
    isOn: (settings) => settings.memory.innerBeat === true || settings.memory.harvestReasoning === true,
  },
  {
    id: "lorebook-switching", name: "Story lorebook switching", area: "world", audience: "author",
    oneLine: "Story lorebook entries switch on and off as the story moves.",
    what: "A story can switch lorebook entries on at a turning point. Per chat keeps each chat's entries separate; file writes change the lorebook files themselves.",
    where: settingsAt("#so-wi-gating-mode", "World › Lorebooks"),
    settings: ["worldInfo.gatingMode", "worldInfo.normalized", "worldInfo.normalizedFrom"], guideTopic: "world-info", doc: authorGuideDoc("world-info"), status: "shipped",
  },
  {
    id: "story-lorebooks", name: "Story lorebooks", area: "world", audience: "author",
    oneLine: "A story's lorebooks load only in the chats that play it.",
    what: "The lorebooks a story lists are added to its own chats, so two stories never share lore. A story lorebook still switched on for every chat is flagged in Repair.",
    where: settingsAt("#so-lorebooks-header", "World › Lorebooks"),
    settings: ["worldInfo.keptGlobal"], guideTopic: "requirements", doc: authorGuideDoc("requirements"), status: "shipped",
  },
  {
    id: "memory-lore", name: "Memory can trigger lore", area: "world", audience: "author",
    oneLine: "Established facts and scene history can activate lorebook entries.",
    what: "Facts, scene history and the current guidance join each lorebook scan, so an entry whose keys they mention activates. Private knowledge never joins.",
    where: settingsAt("#so-wi-scan-memory", "World › Lorebooks"),
    settings: ["worldInfo.scanMemory"], doc: authorGuideDoc("world-info"), status: "shipped",
    isOn: (settings) => settings.worldInfo.scanMemory,
  },
  {
    id: "late-lore", name: "Per-turn lore after the history", area: "world", audience: "author",
    oneLine: "Lore that changes every turn is placed near the end of the prompt, so the start can be reused.",
    what: "Story lorebook entries that activate by keyword or lore select land a few messages from the end of the chat instead of beside the character card, "
      + "with the same text and order. Per chat gating only; a story can keep its authored positions with lore_select.position.",
    where: settingsAt("#so-wi-late-lore", "World › Lorebooks"),
    settings: ["worldInfo.lateLore", "worldInfo.lateLoreDepth"], guideTopic: "world-info", doc: authorGuideDoc("world-info"), status: "shipped",
    isOn: (settings) => settings.worldInfo.lateLore,
  },
  {
    id: "curator", name: "Lorebook curator", area: "world", audience: "author",
    oneLine: "Proposes updates to the story's lorebook as play overtakes it.",
    what: "A background helper reads what happened and proposes switching entries on or off, or correcting text. It touches only the lorebooks the story lists, and never progress or memory.",
    where: settingsAt("#so-curator-enabled", "World › Background helpers"),
    settings: ["stagecraft.curatorEnabled", "stagecraft.acceptMode"], guideTopic: "stagecraft", doc: authorGuideDoc("stagecraft"), status: "shipped",
    needs: ["memory-profile"],
    isOn: (settings) => settings.stagecraft.curatorEnabled && settings.stagecraft.acceptMode !== "off",
  },
  {
    id: "curator-create", name: "New lorebook entries", area: "world", audience: "author",
    oneLine: "The curator proposes a new keyed entry for something play has established.",
    what: "When at least two established facts name a person, place, group or thing that no entry covers, the curator drafts a new entry for the story's own lorebook. "
      + "Each one waits for you, can be edited first, names any entry that already reads as the same thing so you can patch that one instead, counts against the story's limit per chat, "
      + "and a rollback deletes it unless you changed it. A written entry is stamped with its chat; deleting that chat asks whether to delete its entries too. Its model is the Lore creation task.",
    where: settingsAt("#so-curator-create", "World › Background helpers"),
    settings: ["stagecraft.createEnabled", "stagecraft.createRequireMeasured"], guideTopic: "stagecraft", doc: authorGuideDoc("stagecraft"), status: "shipped",
    needs: ["memory-profile"],
    isOn: (settings) => settings.stagecraft.curatorEnabled && settings.stagecraft.createEnabled && settings.stagecraft.acceptMode !== "off",
  },
  {
    id: "curator-markers", name: "Protected and auto lore", area: "world", audience: "author",
    oneLine: "Markers in a lorebook entry keep words safe from the curator, or let its changes apply on their own.",
    what: "Inside an entry, text between {{// so:protect}} and {{// so:end}} is never changed or switched off by the curator. An entry carrying {{// so:auto}} takes the curator's "
      + "changes without review when its changes are set to apply on their own; every other entry still waits for you. SillyTavern drops the markers before the prompt.",
    where: settingsAt("#so-curator-accept-mode", "World › Background helpers"),
    settings: [], guideTopic: "stagecraft", doc: authorGuideDoc("stagecraft"), status: "shipped",
    needs: ["memory-profile"],
  },
  ...IMAGE_FEATURES,
  {
    id: "judge", name: "Judge", area: "judge", audience: "setup",
    oneLine: "A second, fast model for yes/no and pick-one decisions.",
    what: "The judge answers small questions for the story: who speaks next, whether a memory is right, which lore matters. Each use can be "
      + "switched off and says what it sends; without a key every use falls back to its usual path.",
    where: settingsAt("#so-judge-enabled", "Judge"),
    settings: ["judge.enabled", "judge.model", "judge.timeoutMs", "judge.noticesSeen"], doc: "setup/judge.md", status: "shipped", needs: ["judge-plugin"],
    isOn: (settings) => settings.judge.enabled,
  },
  {
    id: "judge-local", name: "Local judge", area: "judge", audience: "setup",
    oneLine: "An open model on this machine that can answer the judge's questions instead of TypeSafe.",
    what: "A small open decision model runs on this computer, started from the tray, and nothing it is asked leaves the machine. "
      + "Pick it per use in the provider list beside each use. Until a use has been measured on it, that use keeps its usual path.",
    where: settingsAt("#so-judge-local-systemone-local", "Judge › Local judge (this machine)"),
    settings: [], doc: "setup/judge.md", status: "experimental", needs: ["judge-plugin"],
    isOn: (settings) => settings.judge.enabled && Object.values(settings.judge.provider).includes("systemone-local"),
  },
  {
    id: "road-ahead", name: "Prepared road ahead", area: "authoring", audience: "author",
    oneLine: "Writes the scenes between two turning points before play gets there.",
    what: "Where a story leaves a gap, the story model writes outline beats to fill it. The judge can write several outlines and keep the best.",
    where: settingsAt("#so-judge-expansion-variants", "Judge › Outlines for the road ahead"),
    settings: ["judge.expansion"], guideTopic: "convergence", doc: authorGuideDoc("convergence"), status: "shipped", needs: ["memory-profile", "author-view"],
  },
  {
    id: "studio", name: "Studio", area: "authoring", audience: "author",
    oneLine: "Edit a story: its cast, turning points, goals and effects.",
    what: "The Studio edits a story draft with a graph, editors for every part and a diagnostics list that says what each problem costs the story. Saving puts the draft in the library.",
    where: settingsAt("#so-open-studio", "Author"),
    settings: [], guideTopic: "story-basics", doc: "author/studio.md", status: "shipped",
  },
  {
    id: "wizard", name: "Story wizard", area: "authoring", audience: "author",
    oneLine: "Builds a story from a premise and creates the cards, lore and group it needs.",
    what: "The wizard interviews you, proposes the story, and offers each character card, lorebook and group as a card you confirm one at a time. It only ever creates; it never deletes your assets.",
    where: settingsAt("#so-new-story-wizard", "Start › New story"),
    settings: ["copilot.enabled"], guideTopic: "story-basics", doc: "author/wizard.md", status: "shipped", needs: ["memory-profile"],
    isOn: (settings) => settings.copilot.enabled,
  },
  {
    id: "character-tutorial", name: "Build a character", area: "authoring", audience: "author",
    oneLine: "One character a step at a time: who, look, voice, greeting, examples, review.",
    what: "Says why each step matters and can draft it. The card is made only when you confirm it; the look is a change you review.",
    where: studioAt("#so-character-tutorial", "Wizard › Build a character"),
    settings: [], guideTopic: "roster", doc: "author/wizard.md", status: "shipped",
  },
  {
    id: "author-view", name: "Author view", area: "authoring", audience: "author",
    oneLine: "Shows the story's internals for this chat: goals, state and what characters hide.",
    what: "Author view adds the story state, scheduler, prompt preview and steering tools to the drawer. It spoils the story, so it asks first.",
    where: drawerAt("#so-author-view", "Author view"),
    settings: [], doc: "author/studio.md", status: "shipped", needs: ["story"],
  },
  {
    id: "diagnostics", name: "Story diagnostics", area: "authoring", audience: "author",
    oneLine: "Says what each problem in a story costs it, before the technical detail.",
    what: "The Studio checks a draft and lists each problem with its consequence for play, so you fix the ones that matter first.",
    where: studioAt("#so-studio-modal", "Diagnostics"),
    settings: [], guideTopic: "gates", doc: "author/studio.md", status: "shipped",
  },
  {
    id: "repair", name: "Repair", area: "setup", audience: "player",
    oneLine: "Names the one thing missing and takes you to the setting that fixes it.",
    what: "When something stops the story, Repair says what will not happen until it is fixed, then shows you the setting, or fixes it in one click. "
      + "The drawer's Setup list shows every finding while a story plays; one that only weakens the story can be dismissed, one that stops it cannot.",
    where: settingsAt("#so-entry-repair", "Repair"),
    settings: ["help.dismissedChecks"], doc: "player/troubleshooting.md", status: "shipped",
  },
  {
    id: "getting-started", name: "Getting started", area: "setup", audience: "player",
    oneLine: "A short checklist: memory model first, then the optional judge and images.",
    what: "The Start card lists what this install still needs, each with what it changes and a Show me button. It folds away once you are done.",
    where: settingsAt("#so-getting-started", "Start"),
    settings: ["help.checklistDismissed"], doc: "setup/README.md", status: "shipped",
  },
  {
    id: "help", name: "Help", area: "setup", audience: "player",
    oneLine: "This list: every feature, whether it is on, and where to find it.",
    what: "The ? button opens this index. Show me jumps to a feature's setting; Read more opens its guide page.",
    where: settingsAt("#so-help-toggle", "Help"),
    settings: ["help.openSections"], doc: "setup/README.md", status: "shipped",
  },
  {
    id: "ask", name: "Ask", area: "setup", audience: "player",
    oneLine: "Ask about Story Orchestrator, SillyTavern or your story. It only reads.",
    what: "Answers from the guide and SillyTavern know-how. While you play it knows only what you have seen; in Author view it reads the whole story.",
    where: settingsAt("#so-copilot-ask", "Setup › Ask questions"),
    settings: ["copilot.ask"], doc: "setup/README.md", status: "shipped", needs: ["memory-profile"],
    isOn: (settings) => settings.copilot.ask,
  },
  {
    id: "memory-test", name: "Memory model test", area: "memory", audience: "setup",
    oneLine: "Runs fixed scenes through the memory model and reports what it can do.",
    what: "The test sends a few short scenes and checks each kind of note the story needs. When the model cannot track private knowledge, it offers to switch that off.",
    where: settingsAt("#so-self-test", "Memory › Test memory model"),
    settings: [], doc: "setup/memory-model.md", status: "shipped", needs: ["memory-profile"],
  },
  {
    id: "reply-thinking", name: "Reply thinking", area: "memory", audience: "setup",
    oneLine: "Limits how long the chat model thinks before each reply.",
    what: "On llama.cpp setups that think, each story reply gets a thinking budget. Medium was as clean as no limit and starts replying sooner.",
    where: settingsAt("#so-reply-effort", "Memory › Reply thinking"),
    settings: ["extraction.replyEffort"], doc: "setup/memory-model.md", status: "shipped",
  },
  {
    id: "models-per-task", name: "Models per task", area: "memory", audience: "setup",
    oneLine: "Send each kind of background work to its own model.",
    what: "Story reads, summaries, the wizard, speaker direction, the curator, lore creation and the inner voice can each use their own profile, or a cloud harness through the harness plugin. "
      + "Profiles are grouped by provider and labelled local or cloud, and a task on a cloud profile says what it sends.",
    where: settingsAt("#so-role-profiles", "Memory › Models per task"),
    settings: ["extraction.profiles", "extraction.routes", "extraction.reasoningBudget"], doc: "setup/memory-model.md", status: "shipped",
  },
  {
    id: "capabilities", name: "Host capabilities", area: "setup", audience: "setup",
    oneLine: "Checks that SillyTavern has everything the extension needs, and copies a bug report.",
    what: "The Setup section lists any SillyTavern feature that is missing, the versions in use and the memory model's context size, with one button to copy it all for a bug report.",
    where: settingsAt("#so-capabilities", "Setup › Host capabilities"),
    settings: [], doc: "player/troubleshooting.md", status: "shipped",
  },
  {
    id: "experiments", name: "Experiments", area: "setup", audience: "author",
    oneLine: "Unmeasured trials.",
    what: "Each experiment sits behind its own switch, on by default so it is seen in play.",
    where: settingsAt("#so-area-setup", "Setup"),
    settings: ["spikes"], doc: "setup/settings-reference.md", status: "experimental",
  },
];

export const FEATURES: readonly Feature[] = [...CORE_FEATURES, ...PRESENCE_FEATURES, ...GAME_FEATURES, ...LIFE_FEATURES, ...LIVING_FEATURES, ...JUDGE_USE_KEYS.map(judgeUseFeature)];

export const coversSetting = (owned: string, key: string): boolean => key === owned || key.startsWith(`${owned}.`);

export const featuresForSetting = (key: string): Feature[] => FEATURES.filter((feature) => feature.settings.some((owned) => coversSetting(owned, key)));

export const visibleFeatures = (authorView: boolean): Feature[] => FEATURES.filter((feature) => authorView || feature.audience !== "author");

export const featuresByArea = (features: readonly Feature[]): Array<{ area: FeatureArea; label: string; features: Feature[] }> =>
  FEATURE_AREAS.map((area) => ({ area, label: AREA_LABELS[area], features: features.filter((feature) => feature.area === area) })).filter((group) => group.features.length);

export const matchesQuery = (feature: Feature, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${feature.name} ${feature.oneLine} ${feature.what} ${AREA_LABELS[feature.area]}`.toLowerCase();
  return words.every((word) => haystack.includes(word));
};

export { authorGuideDoc, GUIDE_BRANCH, guideUrl, HOME_PAGE } from "./guideLinks";
