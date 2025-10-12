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

  registerMacro("story_active_title", () => getState().story?.title ?? "", "Active story title");
  registerMacro("story_active_checkpoint_id", () => getActiveCheckpoint()?.id ?? "", "Current checkpoint id");
  registerMacro("story_active_checkpoint_name", () => getActiveCheckpoint()?.name ?? "", "Current checkpoint name");
  registerMacro("story_active_checkpoint_objective", () => getActiveCheckpoint()?.objective ?? "", "Current checkpoint objective");
  registerMacro("story_turn", () => String(getState().turn ?? 0), "Current turn count");
  registerMacro("story_turns_since_eval", () => String(getState().runtime?.turnsSinceEval ?? 0), "Turns since last arbiter evaluation");
  registerMacro("story_checkpoint_turns", () => String(getState().runtime?.checkpointTurnCount ?? 0), "Turns spent in the active checkpoint");
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
