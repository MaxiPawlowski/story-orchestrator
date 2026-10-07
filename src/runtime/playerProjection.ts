import type { Checkpoint, NormalizedStoryV2 } from "@engine/index";
import type { NarrativeSectionId, NarrativeStatus } from "./narrative";

export const PROJECTION_TRANSCRIPT_MESSAGES = 12;
export const PROJECTION_MESSAGE_CHARS = 600;

const PLAYER_SECTIONS: readonly NarrativeSectionId[] = ["now", "about", "recently", "threads", "chapters", "story", "end"];

export interface ProjectionLine {
  speaker: string;
  text: string;
}

export interface ProjectionSection {
  id: NarrativeSectionId;
  label: string;
  lines: string[];
}

export interface PlayedProjection {
  title: string;
  intro: string | null;
  player: string;
  visited: string[];
  current: { name: string; text: string | null } | null;
  sections: ProjectionSection[];
  cast: string[];
  transcript: ProjectionLine[];
}

export interface StartProjection {
  title: string;
  intro: string | null;
  player: string;
  start: { name: string; text: string | null } | null;
  cast: string[];
}

export interface ProjectionInput {
  story: NormalizedStoryV2 | null;
  narrative: NarrativeStatus;
  visitedPath: readonly string[];
  activeCheckpointId: string | null;
  cast: readonly string[];
  chat: readonly unknown[];
  playerName: string;
  messages?: number;
}

export const playerCheckpointName = (checkpoint: Pick<Checkpoint, "name" | "player_name">): string => (checkpoint.player_name ?? checkpoint.name).trim();

const clip = (text: string) => (text.length > PROJECTION_MESSAGE_CHARS ? `${text.slice(0, PROJECTION_MESSAGE_CHARS).trimEnd()}…` : text);

export const transcriptWindow = (chat: readonly unknown[], messages = PROJECTION_TRANSCRIPT_MESSAGES): ProjectionLine[] => chat.flatMap((row) => {
  if (typeof row !== "object" || row === null) return [];
  const shaped = row as { name?: unknown; mes?: unknown; is_system?: unknown };
  if (shaped.is_system === true || typeof shaped.mes !== "string" || !shaped.mes.trim()) return [];
  return [{ speaker: typeof shaped.name === "string" && shaped.name.trim() ? shaped.name.trim() : "Someone", text: clip(shaped.mes.trim()) }];
}).slice(-messages);

const intro = (story: NormalizedStoryV2 | null) => story?.player_intro?.trim() || story?.description?.trim() || null;

const reachedNames = (story: NormalizedStoryV2 | null, visitedPath: readonly string[], activeCheckpointId: string | null): string[] => {
  if (!story) return [];
  const ids = [...visitedPath, ...(activeCheckpointId ? [activeCheckpointId] : [])];
  const names = ids.flatMap((id) => {
    const checkpoint = story.checkpointById[id];
    return checkpoint ? [playerCheckpointName(checkpoint)] : [];
  });
  return [...new Set(names)];
};

export function playedProjection(input: ProjectionInput): PlayedProjection {
  const { story } = input;
  const active = story && input.activeCheckpointId ? story.checkpointById[input.activeCheckpointId] : undefined;
  return {
    title: input.narrative.title,
    intro: intro(story),
    player: input.playerName.trim(),
    visited: reachedNames(story, input.visitedPath, input.activeCheckpointId),
    current: active ? { name: playerCheckpointName(active), text: active.player_text?.trim() || null } : null,
    sections: input.narrative.sections
      .filter((section) => PLAYER_SECTIONS.includes(section.id) && section.lines.length)
      .map((section) => ({ id: section.id, label: section.label, lines: [...section.lines] })),
    cast: [...new Set(input.cast.map((name) => name.trim()).filter(Boolean))],
    transcript: transcriptWindow(input.chat, input.messages),
  };
}

export function startProjection(story: NormalizedStoryV2, playerName: string, cast: readonly string[]): StartProjection {
  const start = story.checkpointById[story.startCheckpointId];
  return {
    title: story.title,
    intro: intro(story),
    player: playerName.trim(),
    start: start ? { name: playerCheckpointName(start), text: start.player_text?.trim() || null } : null,
    cast: [...new Set(cast.map((name) => name.trim()).filter(Boolean))],
  };
}

export const projectionText = (projection: PlayedProjection): string => [
  `Story: ${projection.title}`,
  ...(projection.intro ? [`About: ${projection.intro}`] : []),
  ...(projection.player ? [`The player is ${projection.player}.`] : []),
  ...(projection.cast.length ? [`With: ${projection.cast.join(", ")}`] : []),
  ...(projection.visited.length ? [`Scenes so far: ${projection.visited.join(" → ")}`] : []),
  ...projection.sections.map((section) => `${section.label}:\n${section.lines.map((line) => `- ${line}`).join("\n")}`),
  ...(projection.transcript.length ? [`Recent messages:\n${projection.transcript.map((line) => `${line.speaker}: ${line.text}`).join("\n")}`] : []),
].join("\n\n");
