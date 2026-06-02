import { getContext } from "@services/STAPI";
import {
  getOpenSeeds,
  getRecentSceneMemory,
  getRoleStates,
  getTopConsequences,
} from "@utils/memory-stores";
import {
  clampCheckpointIndex,
  deriveCheckpointSummaries,
  type RuntimeStoryState,
} from "@utils/story-state";
import type { NormalizedStory, NormalizedTransition } from "@utils/story-validator";
import type {
  Consequence,
  ForegoneTransition,
  NarrativeSeed,
  RoleState,
  SceneMemoryEntry,
} from "../types/narrative-memory";

const DEFAULT_CHAT_LIMIT = 10;
const ALL_SECTIONS: NarrativeContextSection[] = ["story", "checkpoints", "memory", "chat"];

export type NarrativeContextSection = "story" | "checkpoints" | "memory" | "chat";

export interface NarrativeContext {
  storyTitle: string;
  storyDescription: string;
  currentCheckpoint: { name: string; objective: string };
  recentCheckpoints: { name: string; objective: string; status: string }[];
  activeTransitions: { id: string; condition: string; label?: string }[];
  consequences: Consequence[];
  openSeeds: NarrativeSeed[];
  roleStates: Record<string, RoleState>;
  sceneMemory: SceneMemoryEntry[];
  foregoneTransitions: ForegoneTransition[];
  chatExcerpt: string;
}

const createEmptyContext = (): NarrativeContext => ({
  storyTitle: "",
  storyDescription: "",
  currentCheckpoint: { name: "", objective: "" },
  recentCheckpoints: [],
  activeTransitions: [],
  consequences: [],
  openSeeds: [],
  roleStates: {},
  sceneMemory: [],
  foregoneTransitions: [],
  chatExcerpt: "",
});

const normalizeSections = (sections?: NarrativeContextSection[]): Set<NarrativeContextSection> => {
  return new Set(sections?.length ? sections : ALL_SECTIONS);
};

const formatTransitionCondition = (transition: NormalizedTransition): string => {
  const parts: string[] = [];
  if (transition.trigger.type === "regex") {
    const regexSummary = transition.trigger.regexes.map((regex) => regex.toString()).join(", ");
    if (regexSummary) parts.push(`Regex: ${regexSummary}`);
  }
  if (transition.trigger.type === "timed" && typeof transition.trigger.withinTurns === "number") {
    parts.push(`Within ${transition.trigger.withinTurns} turns`);
  }
  if (transition.trigger.condition?.trim()) {
    parts.push(`Condition: ${transition.trigger.condition.trim()}`);
  }
  if (transition.description?.trim()) {
    parts.push(`Description: ${transition.description.trim()}`);
  }
  return parts.join(" | ") || "No condition provided.";
};

const buildChatExcerpt = (limit = DEFAULT_CHAT_LIMIT): string => {
  const { chat } = getContext();
  if (!Array.isArray(chat) || chat.length === 0) return "";

  return chat.slice(-limit)
    .map((msg, idx) => {
      const text = (msg.mes ?? "").trim();
      if (!text) return null;
      const who = msg.name || (msg.is_user ? "Player" : "Companion");
      return `${idx + 1}. ${who}: ${text}`;
    })
    .filter((line): line is string => Boolean(line))
    .reverse()
    .join("\n");
};

const buildMemorySection = (runtime: RuntimeStoryState): Pick<
  NarrativeContext,
  "consequences" | "openSeeds" | "roleStates" | "sceneMemory" | "foregoneTransitions"
> => {
  return {
    consequences: getTopConsequences({ limit: 10 }),
    openSeeds: getOpenSeeds(),
    roleStates: getRoleStates(),
    sceneMemory: getRecentSceneMemory(5),
    foregoneTransitions: [...(runtime.memory?.foregoneTransitions ?? [])],
  };
};

export function buildNarrativeContext(opts: {
  story: NormalizedStory;
  runtime: RuntimeStoryState;
  sections?: NarrativeContextSection[];
}): NarrativeContext {
  const { story, runtime } = opts;
  const sections = normalizeSections(opts.sections);
  const context = createEmptyContext();

  if (sections.has("story")) {
    context.storyTitle = story.title ?? "";
    context.storyDescription = story.description?.trim() ?? "";
  }

  if (sections.has("checkpoints")) {
    const checkpointIndex = clampCheckpointIndex(runtime.checkpointIndex, story);
    const currentCheckpoint = story.checkpoints[checkpointIndex];
    const currentCheckpointId = runtime.activeCheckpointKey ?? currentCheckpoint?.id ?? null;

    context.currentCheckpoint = {
      name: currentCheckpoint?.name ?? "",
      objective: currentCheckpoint?.objective ?? "",
    };
    context.recentCheckpoints = deriveCheckpointSummaries(story, runtime)
      .slice(0, checkpointIndex)
      .filter((summary) => summary.status === "complete" || summary.status === "failed")
      .reverse()
      .map((summary) => ({
        name: summary.name,
        objective: summary.objective,
        status: summary.status,
      }));
    context.activeTransitions = story.transitions
      .filter((transition) => transition.from === currentCheckpointId)
      .map((transition) => ({
        id: transition.id,
        condition: formatTransitionCondition(transition),
        ...(transition.label ? { label: transition.label } : {}),
      }));
  }

  if (sections.has("memory")) {
    const memorySection = buildMemorySection(runtime);
    context.consequences = memorySection.consequences;
    context.openSeeds = memorySection.openSeeds;
    context.roleStates = memorySection.roleStates;
    context.sceneMemory = memorySection.sceneMemory;
    context.foregoneTransitions = memorySection.foregoneTransitions;
  }

  if (sections.has("chat")) {
    context.chatExcerpt = buildChatExcerpt();
  }

  return context;
}

export function formatNarrativeContextForPrompt(ctx: NarrativeContext): string {
  const lines: string[] = [
    "=== Story ===",
    `Title: ${ctx.storyTitle || "(none)"}`,
    `Description: ${ctx.storyDescription || "(none)"}`,
    "",
    "=== Current Checkpoint ===",
    `Name: ${ctx.currentCheckpoint.name || "(none)"}`,
    `Objective: ${ctx.currentCheckpoint.objective || "(none)"}`,
    "",
    "=== Recent Checkpoints ===",
  ];

  if (ctx.recentCheckpoints.length) {
    ctx.recentCheckpoints.forEach((checkpoint, idx) => {
      lines.push(`${idx + 1}. [${checkpoint.status}] ${checkpoint.name} - ${checkpoint.objective}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Active Transitions ===");
  if (ctx.activeTransitions.length) {
    ctx.activeTransitions.forEach((transition, idx) => {
      lines.push(`${idx + 1}. [${transition.id}] ${transition.label?.trim() || "(unlabeled)"}`);
      lines.push(`   ${transition.condition}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Active Consequences ===");
  if (ctx.consequences.length) {
    ctx.consequences.forEach((entry, idx) => {
      const tags = entry.tags.length ? ` | tags: ${entry.tags.join(", ")}` : "";
      lines.push(`${idx + 1}. ${entry.text} | weight: ${entry.weight}${tags}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Open Seeds ===");
  if (ctx.openSeeds.length) {
    ctx.openSeeds.forEach((entry, idx) => {
      lines.push(`${idx + 1}. [${entry.kind}] ${entry.text}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Role States ===");
  const roleStates = Object.values(ctx.roleStates);
  if (roleStates.length) {
    roleStates.forEach((entry, idx) => {
      lines.push(`${idx + 1}. ${entry.role}: ${entry.summary}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Scene Memory ===");
  if (ctx.sceneMemory.length) {
    ctx.sceneMemory.forEach((entry, idx) => {
      lines.push(`${idx + 1}. [${entry.checkpointId}] turn ${entry.turn}: ${entry.text}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Foregone Transitions ===");
  if (ctx.foregoneTransitions.length) {
    ctx.foregoneTransitions.forEach((entry, idx) => {
      lines.push(`${idx + 1}. [${entry.transitionId}] from ${entry.fromCheckpointId}: ${entry.reason}`);
    });
  } else {
    lines.push("None.");
  }

  lines.push("", "=== Chat Excerpt ===", ctx.chatExcerpt || "None.");
  return lines.join("\n");
}
