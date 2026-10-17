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
    id: "tunnelvision-story-lore", area: "extension", scope: "story", audience: "author", severity: "degrades", feature: "story-lorebooks",
    detect: (snapshot) => {
      const books = snapshot.tunnelVisionBooks ?? [];
      if (!books.length) return null;
      const suppressed = books.filter((book) => book.suppressesScan).map((book) => book.name);
      const writable = books.filter((book) => book.canWrite).map((book) => book.name);
      return {
        consequence: "TunnelVision manages lorebooks this story uses, so it can hide story lore or change entries outside the story's control.",
        detail: [
          ...(suppressed.length ? [`Normal keyword scanning suppressed: ${suppressed.join(", ")}. Enable keyword triggers or native injection in TunnelVision.`] : []),
          ...(writable.length ? [`Shared write access: ${writable.join(", ")}. TunnelVision does not enforce Story Orchestrator's protected spans; `
            + "disable TunnelVision for these books to keep its writers out. Read-only permission alone does not stop every background writer."] : []),
        ].join(" "),
      };
    },
  },
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
    id: "cc-filler-after-reply", area: "extension", scope: "story", audience: "player", severity: "info", feature: "stories",
    detect: (snapshot) => (has(snapshot, "cc-send-if-empty") ? {
      consequence: "SillyTavern adds a filler line after a reply before a character answers another character, in the prompt only, "
        + "so the story's own replies may read it as something the player said.",
      detail: "The Chat Completion preset sets \"Replace empty message\" (send_if_empty). When the prompt ends on a character's reply, "
        + "SillyTavern appends that text as a user message; "
        + "this story's NPC replies are triggered right after other replies, so they carry it. It never reaches the chat. Clear the field in the preset if the replies answer it.",
      player: "SillyTavern adds a filler line after a character's reply, in the prompt only: you will not see it in the chat.",
    } : null),
  },
  {
    id: "nemo-lorebook-keys", area: "extension", scope: "story", audience: "author", severity: "info", feature: "story-lorebooks",
    detect: (snapshot) => (has(snapshot, "nemo-lorebook-spacing") ? {
      consequence: "NemoPresetExt rewrites lorebook keys of more than one word while SillyTavern scans, so key previews and the story's own key matching may differ from what fires.",
      detail: "NemoPresetExt turns every key of two or more words into a pattern that also matches its own word separator, on SillyTavern's scan copies only: "
        + "the saved lorebooks are unchanged. A multiword key that names a character may stop counting as that character's own entry in lore select. "
        + "Use single-word keys for names, or disable NemoPresetExt while this story plays.",
    } : null),
  },
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
