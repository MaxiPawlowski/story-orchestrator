import type { TransitionTriggerDraft } from "@utils/checkpoint-studio";

export type SlashCommandMeta = {
  name: string;
  aliases: string[];
  description?: string;
  samples: string[];
  isStoryOrchestrator: boolean;
};

export type AutomationDraftLine = {
  line: string;
  trimmed: string;
  status: "ok" | "error" | "blank";
  message?: string;
};

export type TransitionEditorHandlers = {
  setTrigger: (draft: TransitionTriggerDraft) => void;
  patchTrigger: (patch: Partial<TransitionTriggerDraft>) => void;
  handleTypeChange: (type: TransitionTriggerDraft["type"]) => void;
};

export type PresetDraftState = Record<string, Record<string, string>>;

export type MacroDisplayCategory = "Runtime" | "Role";

export type MacroDisplayEntry = {
  key: string;
  description: string;
  category: MacroDisplayCategory;
  detail?: string;
};

export const STORY_MACRO_BASE_ENTRIES: MacroDisplayEntry[] = [
  { key: "story_title", description: "Story title (prompt safe)", category: "Runtime" },
  { key: "story_description", description: "Story description from schema", category: "Runtime" },
  { key: "story_current_checkpoint", description: "Formatted current checkpoint summary", category: "Runtime" },
  { key: "story_past_checkpoints", description: "Past checkpoint summary (most recent first)", category: "Runtime" },
  { key: "story_possible_triggers", description: "Formatted list of transition candidates", category: "Runtime" },
  { key: "chat_excerpt", description: "Recent conversation excerpt for arbiter prompts (most recent first)", category: "Runtime" },
  { key: "story_player_name", description: "Active player name", category: "Runtime" },
];
