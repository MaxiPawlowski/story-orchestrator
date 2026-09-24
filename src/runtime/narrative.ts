import type { ObjectiveKind, TensionLevel } from "@engine/index";
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

// E1's other half: an edit the run cannot rewind to. Not a variant of the notice above — that one
// says the story moved, and the whole point here is that it did not. Player wording, checkpoint
// names only, and it names the two ways out rather than leaving the player with a stuck story.
export interface RollbackUnavailable {
  messageId: number;
  checkpointName: string;
  oldest: { boundary: number; messageId: number };
  at: string;
}

export const rollbackUnavailableText = (notice: RollbackUnavailable): string =>
  `That edit reaches back further than this chat can rewind, so the story has not moved: you are still at ${notice.checkpointName}. What was learned from the changed messages has been dropped. Re-read from ${notice.checkpointName} to rebuild it, or restart the story to play the new text from the beginning.`;

// v2.4 plan 02 §5 (D3): a branch holds the story state it was cut from, and nothing adopts it on its own.
// Checkpoint names only, one sentence, one way forward.
export const branchNoticeText = (checkpointName: string | null): string =>
  `This chat branched from a story in progress${checkpointName ? `, last at ${checkpointName}` : ""}. Continue from here to pick the story up where this branch ends.`;

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
  sceneLocation?: string | null;
  /**
   * C2 (v2.3 plan 03): the scene tracker has stopped answering. Distinct from simply having no
   * location — "we never knew" says nothing, while "we knew and can no longer confirm it" is
   * something the player should be told rather than left to infer from a place name that has
   * quietly gone stale.
   */
  sceneUnconfirmed?: boolean;
  /** v2.3 plan 06: the write of this chat's own state was not confirmed, in the player's own words. */
  saveNotice?: string | null;
  /**
   * v2.3 plan 07 (C4): the player's last two turns matched no exit the checkpoint declares. The
   * honest sentence is that the world has not answered yet — never that the prepared route happened
   * anyway, and never silence.
   */
  agencyNotice?: string | null;
  /**
   * v2.3 plan 07 (C4, delegated decision): the recap's phrasing follows the same policy as steering —
   * an objective that needs the player's own act must not read as one the world will resolve for them.
   */
  objectiveKind?: ObjectiveKind;
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

export function buildNarrativeStatus(input: NarrativeInput): NarrativeStatus {
  const sections: NarrativeSection[] = [];

  const now: string[] = [];
  if (input.checkpointName) now.push(input.checkpointName);
  if (input.sceneLocation) now.push(`At ${input.sceneLocation}.`);
  // Never both: a confirmed place wins, and this line only appears when the tracker had one and
  // can no longer stand behind it. Player-facing, so it says what is true without naming the
  // machinery — no "tracker", no "judge", no failure count.
  else if (input.sceneUnconfirmed) now.push("Somewhere the story has not settled yet.");
  if (input.objective) {
    now.push(input.objective);
    if (input.objectiveKind === "player_action") now.push("What happens next is yours to decide.");
  }
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

  // v2.3 plan 06: the player's own state may not have reached the server. It goes in the SAME status
  // section as everything else the machine is doing, not as machinery of its own: it is one sentence
  // about whether the story is safe, and it is the only thing here a player can act on.
  const status = [input.pipeline.text, input.saveNotice, input.agencyNotice].filter((line): line is string => Boolean(line));
  sections.push({ id: "status", label: "Status", lines: status });

  const title = input.storyTitle ?? "Your story";
  const text = sections.map((section) => `${section.label}\n${section.lines.map((line) => `  ${line}`).join("\n")}`).join("\n\n");
  return { title, sections, text };
}

export function renderNarrativeNode(status: NarrativeStatus, doc: Document, heading = status.title): HTMLElement {
  const element = (tag: string, style: string | null, text: string | null) => {
    const node = doc.createElement(tag);
    if (style) node.setAttribute("style", style);
    if (text !== null) node.append(doc.createTextNode(text));
    return node;
  };
  const root = doc.createElement("div");
  root.append(element("h3", "margin-top:0", heading));
  const body = element("div", "text-align:left", null);
  for (const section of status.sections) {
    const block = element("div", "margin-bottom:0.6em", null);
    block.append(element("b", null, section.label), element("div", "white-space:pre-wrap", section.lines.join("\n")));
    body.append(block);
  }
  root.append(body);
  return root;
}
