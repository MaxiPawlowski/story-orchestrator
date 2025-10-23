import { MacrosParser } from "@services/SillyTavernAPI";
import { storySessionStore } from "@store/storySessionStore";
import type { StorySessionValueState } from "@store/storySessionStore";

const macroKey = (role: string) => `story_role_${role.toLowerCase()}`;

const sanitize = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const getState = (): StorySessionValueState => storySessionStore.getState();

const getRoleName = (role: string): string => {
  const story = getState().story;
  if (!story || !story.roles) return "";
  const value = (story.roles as Record<string, unknown>)[role];
  return sanitize(value);
};

const getActiveCheckpoint = () => {
  const { story, runtime } = getState();
  if (!story) return undefined;
  const checkpoints = story.checkpoints ?? [];
  if (!checkpoints.length) return undefined;
  const index = Math.max(0, Math.min(runtime.checkpointIndex, checkpoints.length - 1));
  return checkpoints[index];
};

let registered = false;

const dynamicSnapshot = {
  storyDescription: "",
  currentCheckpoint: "",
  pastCheckpoints: "",
  possibleTriggers: "",
  storyTitle: "",
  chatExcerpt: "",
};

const registerMacro = (key: string, resolver: (nonce?: string) => string, description?: string) => {
  try {
    if (!MacrosParser || typeof MacrosParser.registerMacro !== "function") return;
    if (MacrosParser.has?.(key)) {
      MacrosParser.unregisterMacro?.(key);
    }
    MacrosParser.registerMacro(key, (nonce?: string) => sanitize(resolver(nonce)), description);
  } catch (err) {
    console.warn("[StoryMacros] Failed to register macro", key, err);
  }
};

export const ensureStoryMacros = () => {
  if (registered) return;
  if (!MacrosParser) return;

  registerMacro("story_title", () => dynamicSnapshot.storyTitle || (getState().story?.title ?? ""), "Story title");
  registerMacro("story_description", () => dynamicSnapshot.storyDescription, "Story description");
  registerMacro("story_current_checkpoint", () => dynamicSnapshot.currentCheckpoint, "Formatted current checkpoint summary");
  registerMacro("story_past_checkpoints", () => dynamicSnapshot.pastCheckpoints, "Past checkpoint summary (most recent first)");
  registerMacro("story_possible_triggers", () => dynamicSnapshot.possibleTriggers, "Formatted list of transition candidates");
  registerMacro("chat_excerpt", () => dynamicSnapshot.chatExcerpt, "Recent conversation excerpt for arbiter prompts (most recent first)");
  registerMacro("story_player_name", () => getState().requirements?.currentUserName ?? "", "Active player name");

  const roles = Object.keys(getState().story?.roles ?? {});
  roles.forEach((role) => {
    registerMacro(macroKey(role), () => getRoleName(role), `Story role name for ${role}`);
  });

  // Always provide DM/companion shortcuts even if they are absent in story metadata
  registerMacro("story_role_dm", () => getRoleName("dm"), "Story DM role name");
  registerMacro("story_role_companion", () => getRoleName("companion"), "Story companion role name");

  registered = true;
};

export const refreshRoleMacros = () => {
  if (!MacrosParser) return;
  const story = getState().story;
  const registeredRoles = Object.keys(story?.roles ?? {});
  registeredRoles.forEach((role) => {
    registerMacro(macroKey(role), () => getRoleName(role), `Story role name for ${role}`);
  });
};

const assignDynamicValue = (key: keyof typeof dynamicSnapshot, value: unknown) => {
  if (value === undefined) return;
  dynamicSnapshot[key] = sanitize(value);
};

export const updateStoryMacroSnapshot = (next: {
  storyDescription?: string;
  currentCheckpoint?: string;
  pastCheckpoints?: string;
  possibleTriggers?: string;
  storyTitle?: string;
  chatExcerpt?: string;
}) => {
  if (!next) return;
  assignDynamicValue("storyDescription", next.storyDescription);
  assignDynamicValue("currentCheckpoint", next.currentCheckpoint);
  assignDynamicValue("pastCheckpoints", next.pastCheckpoints);
  assignDynamicValue("possibleTriggers", next.possibleTriggers);
  assignDynamicValue("storyTitle", next.storyTitle);
  assignDynamicValue("chatExcerpt", next.chatExcerpt);
};

export const resetStoryMacroSnapshot = () => {
  dynamicSnapshot.storyDescription = "";
  dynamicSnapshot.currentCheckpoint = "";
  dynamicSnapshot.pastCheckpoints = "";
  dynamicSnapshot.possibleTriggers = "";
  dynamicSnapshot.storyTitle = "";
  dynamicSnapshot.chatExcerpt = "";
};
