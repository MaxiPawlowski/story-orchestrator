import type { TensionLevel } from "@engine/index";
import type { PipelineStatus } from "./pipeline";

// The one "where am I" composition (finding U4). The player Overview renders it, the away-recap
// popup renders the same thing modally, and /story recap prints its text — three surfaces, one
// source. Player voice only: checkpoint names, thread texts, no ids, no counters, no gates.
export type NarrativeSectionId = "now" | "recently" | "threads" | "story" | "pending" | "status";

export interface NarrativeSection {
  id: NarrativeSectionId;
  label: string;
  lines: string[];
}

export interface NarrativeTransition {
  fromName: string | null;
  toName: string;
}

// A mutation (edit/delete/swipe) rolled the story back: the player is told once, in their own
// terms, and the notice clears at the next committed boundary.
export interface RollbackNotice {
  checkpointName: string;
  at: string;
}

export const rollbackNoticeText = (notice: RollbackNotice): string =>
  `The story stepped back to ${notice.checkpointName} to match your edit.`;

export interface NarrativeInput {
  storyTitle: string | null;
  checkpointName: string | null;
  objective: string | null;
  lastTransition: NarrativeTransition | null;
  openThreads: string[];
  canon: string;
  tensionLevel: TensionLevel | null;
  pendingCount: number;
  pipeline: PipelineStatus;
}

export interface NarrativeStatus {
  title: string;
  sections: NarrativeSection[];
  text: string;
}

export const CANON_EXCERPT_CHARS = 600;

const TENSION_COPY: Record<TensionLevel, string> = {
  calm: "The scene is calm.",
  stirring: "Something is starting to stir.",
  tense: "The scene is tense.",
  critical: "Things are close to breaking.",
  peak: "Everything is at breaking point.",
};

export const excerpt = (value: string, max = CANON_EXCERPT_CHARS): string =>
  (value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`);

export const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildNarrativeStatus(input: NarrativeInput): NarrativeStatus {
  const sections: NarrativeSection[] = [];

  const now: string[] = [];
  if (input.checkpointName) now.push(input.checkpointName);
  if (input.objective) now.push(input.objective);
  if (input.tensionLevel) now.push(TENSION_COPY[input.tensionLevel]);
  if (now.length) sections.push({ id: "now", label: "Where you are", lines: now });

  const moved = input.lastTransition;
  if (moved) {
    sections.push({ id: "recently", label: "Recently", lines: [moved.fromName ? `You left ${moved.fromName} behind and moved into ${moved.toName}.` : `You moved into ${moved.toName}.`] });
  }

  if (input.openThreads.length) {
    sections.push({ id: "threads", label: "Open threads", lines: input.openThreads });
  }

  const canon = input.canon.trim();
  if (canon) sections.push({ id: "story", label: "The story so far", lines: [excerpt(canon)] });

  if (input.pendingCount > 0) {
    const noun = input.pendingCount === 1 ? "thing" : "things";
    sections.push({ id: "pending", label: "Noted", lines: [`${input.pendingCount} ${noun} the story picked up — they take effect on the next turn.`] });
  }

  sections.push({ id: "status", label: "Status", lines: [input.pipeline.text] });

  const title = input.storyTitle ?? "Your story";
  const text = sections.map((section) => `${section.label}\n${section.lines.map((line) => `  ${line}`).join("\n")}`).join("\n\n");
  return { title, sections, text };
}

export function renderNarrativeHtml(status: NarrativeStatus, heading = status.title): string {
  const body = status.sections
    .map((section) => `<div style="margin-bottom:0.6em"><b>${escapeHtml(section.label)}</b><div style="white-space:pre-wrap">${section.lines.map((line) => escapeHtml(line)).join("\n")}</div></div>`)
    .join("");
  return `<h3 style="margin-top:0">${escapeHtml(heading)}</h3><div style="text-align:left">${body}</div>`;
}
