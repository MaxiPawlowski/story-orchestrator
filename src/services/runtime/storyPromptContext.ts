import type { RuntimeStoryState, CheckpointStatus } from "@utils/story-state";
import { clampCheckpointIndex, deriveCheckpointStatuses } from "@utils/story-state";
import type { NormalizedCheckpoint, NormalizedStory } from "@utils/story-validator";
import type { ArbiterTransitionOption } from "@services/CheckpointArbiterService";

export interface StoryPromptContextSnapshot {
  storyTitle: string;
  storyDescription: string;
  currentCheckpointSummary: string;
  pastCheckpointsSummary: string;
  transitionSummary: string;
}

function formatStatusLabel(status: CheckpointStatus): string {
  switch (status) {
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    case "current":
      return "Current";
    case "pending":
    default:
      return "Pending";
  }
}

function buildStoryDescription(story: NormalizedStory): string {
  return story.description?.trim() ?? "";
}

function buildCurrentCheckpointSummary(cp?: NormalizedCheckpoint): string {
  if (!cp) return "";
  const lines: string[] = [`Name: ${cp.name}`];
  if (cp.objective) lines.push(`Objective: ${cp.objective}`);
  return lines.join("\n");
}

function buildPastCheckpointsSummary(story: NormalizedStory, statuses: CheckpointStatus[], currentIndex: number): string {
  if (!statuses.length || currentIndex <= 0) {
    return "None completed yet.";
  }

  const checkpoints = story.checkpoints ?? [];
  const summaryLines: string[] = [];
  for (let i = currentIndex - 1; i >= 0; i -= 1) {
    const cp = checkpoints[i];
    if (!cp) continue;
    const status = statuses[i];
    if (status !== "complete" && status !== "failed") continue;
    summaryLines.push(`- [${formatStatusLabel(status)}] ${cp.name} - ${cp.objective}`);
  }

  return summaryLines.length ? summaryLines.join("\n") : "None completed yet.";
}

export function summarizeTransitions(options: ArbiterTransitionOption[]): string {
  if (!options.length) {
    return "No transition candidates are currently available.";
  }
  const lines: string[] = ["Evaluate the candidate transitions below. Select at most one to advance."];
  options.forEach((option, idx) => {
    const segments: string[] = [];
    const headerParts: string[] = [];
    if (option.label) headerParts.push(option.label);
    if (option.targetName) headerParts.push(`Next: ${option.targetName}`);
    const headerSuffix = headerParts.length ? ` ${headerParts.join(" | ")}` : "";
    segments.push(`${idx + 1}. [${option.id}]${headerSuffix}`.trim());
    if (option.description) segments.push(`   ${option.description}`);
    if (option.condition) segments.push(`   Condition: ${option.condition}`);
    lines.push(segments.join("\n"));
  });
  lines.push('If none should advance, respond with {"decision": "continue"} and null transition.');
  return lines.join("\n");
}

export function createStoryPromptContext(
  story: NormalizedStory,
  runtime: RuntimeStoryState,
  transitionOptions: ArbiterTransitionOption[],
): StoryPromptContextSnapshot {
  const checkpointIndex = clampCheckpointIndex(runtime.checkpointIndex, story);
  const checkpoint = story.checkpoints[checkpointIndex];
  const statuses = deriveCheckpointStatuses(story, runtime);

  return {
    storyTitle: story.title ?? "",
    storyDescription: buildStoryDescription(story),
    currentCheckpointSummary: buildCurrentCheckpointSummary(checkpoint),
    pastCheckpointsSummary: buildPastCheckpointsSummary(story, statuses, checkpointIndex),
    transitionSummary: summarizeTransitions(transitionOptions),
  };
}

export function createEmptyStoryPromptContext(story: NormalizedStory): StoryPromptContextSnapshot {
  return {
    storyTitle: story.title ?? "",
    storyDescription: buildStoryDescription(story),
    currentCheckpointSummary: "",
    pastCheckpointsSummary: "",
    transitionSummary: summarizeTransitions([]),
  };
}
