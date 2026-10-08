import type { Check } from "./checks";
import type { ExtensionConflict } from "./extensionConflicts";
import type { RuntimeSnapshot } from "./types";

const has = (snapshot: RuntimeSnapshot, id: ExtensionConflict): boolean => Boolean(snapshot.extensionConflicts?.includes(id));

export const EXTENSION_SETTINGS_SELECTORS = {
  steppedThinking: "#stepthink_settings",
  presence: "#presence_settings",
  vectors: ".vectors_settings",
} as const;

export const EXTENSION_DEGRADE_CHECKS: readonly Check[] = [
  {
    id: "stepped-thinking-separated", area: "extension", scope: "story", audience: "player", severity: "degrades", feature: "memory",
    detect: (snapshot) => (has(snapshot, "stepped-thinking-separated") ? {
      consequence: "Stepped Thinking posts each character's thoughts as chat messages, so the story treats a thought as something that happened: it can remember it and move on because of it.",
      detail: "Stepped Thinking is on in its deprecated \"Separated\" mode, which writes every thought into the chat as its own message. Each one counts as a reply here: "
        + "the memory model reads it with the scene, and a turning point can open on it. Switch Stepped Thinking's Mode to \"Embedded\" (thoughts stay out of the chat), "
        + "or switch Stepped Thinking off while this story plays.",
      player: "Stepped Thinking posts characters' thoughts as chat messages, so the story treats a thought as something that happened. "
        + "Set its Mode to \"Embedded\" in SillyTavern's extensions, or switch it off.",
      target: { kind: "st-extensions", selector: EXTENSION_SETTINGS_SELECTORS.steppedThinking },
    } : null),
  },
  {
    id: "presence-hides-chat", area: "extension", scope: "story", audience: "player", severity: "degrades", feature: "memory",
    detect: (snapshot) => (has(snapshot, "presence") ? {
      consequence: "Presence hides most of the chat while a character is about to speak, so the story's memory can read the chat as that one character saw it and miss what happened.",
      detail: "Presence is enabled and switched on. While a group member is drafted it hides every message that member did not witness, and a memory read "
        + "that runs in that moment sees one member's view of the scene. Story Orchestrator already keeps track of who knows what; "
        + "untick \"Enable Presence\" in its settings while this story plays.",
      player: "Presence hides parts of the chat from each character, and the story's memory can read the chat while it is hidden, so it may miss what happened. "
        + "Switch Presence off in SillyTavern's extensions while this story plays.",
      target: { kind: "st-extensions", selector: EXTENSION_SETTINGS_SELECTORS.presence },
    } : null),
  },
  {
    id: "prompt-inspector-on", area: "extension", scope: "story", audience: "player", severity: "degrades", feature: "stories",
    detect: (snapshot) => (has(snapshot, "prompt-inspector") ? {
      consequence: "Prompt Inspector is inspecting prompts, so every reply waits for you to confirm its prompt in a popup before it is sent.",
      detail: "Prompt Inspector is enabled and its inspect toggle is on (kept in this browser). It opens its editor before every reply SillyTavern generates, "
        + "so a group turn waits once per character and the story waits with it. Choose \"Stop Inspecting\" in SillyTavern's extensions menu (the magic wand) to play without the pauses.",
      player: "Prompt Inspector is on, so every reply waits for you to confirm its prompt in a popup. "
        + "Choose \"Stop Inspecting\" in SillyTavern's extensions menu (the magic wand) to play without the pauses.",
    } : null),
  },
];

export const EXTENSION_INFO_CHECKS: readonly Check[] = [
  {
    id: "vectors-world-info", area: "extension", scope: "story", audience: "author", severity: "info", feature: "judge-use-lore-exclusive",
    detect: (snapshot) => (has(snapshot, "vectors-world-info") ? {
      consequence: "Vector Storage can switch on lorebook entries by itself, so this story's exclusive lore choice stays off and every matching entry still reaches the prompt.",
      detail: "This story sets lore_select.exclusive, which holds back the lore the judge did not pick only while Vector Storage's \"Enable for World Info\" is off. "
        + "With it on, the picks are still forced, but nothing is held back. Untick \"Enable for World Info\" under Vector Storage's World Info settings to use exclusive lore.",
      target: { kind: "st-extensions", selector: EXTENSION_SETTINGS_SELECTORS.vectors },
    } : null),
  },
];
