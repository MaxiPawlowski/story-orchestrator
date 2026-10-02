import type { Checkpoint, NormalizedStoryV2, ObjectiveKind, TensionLevel } from "@engine/index";
import type { MemoryTier } from "@memory/index";
import type { PipelineStatus } from "./pipeline";
import type { LatestScene } from "./recapCurrent";

// The one "where am I" composition (finding). The player Overview renders it, the away-recap
// popup renders the same thing modally, and /story recap prints its text — three surfaces, one
// source. Player voice only: checkpoint names, thread texts, no ids, no counters, no gates.
export type NarrativeSectionId = "now" | "about" | "recently" | "threads" | "story" | "chapters" | "end" | "pending" | "status";

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
export type RollbackKind = "edit" | "delete" | "swipe";

export interface RollbackNotice {
  checkpointName: string;
  playerName: string | null;
  at: string;
  kind?: RollbackKind;
}

export const playerPlaceText = (playerName: string | null | undefined): string => playerName || "an earlier scene";

const ROLLBACK_CAUSE: Record<RollbackKind, string> = {
  edit: "to match your edit",
  delete: "to match the deleted message",
  swipe: "to match the swiped reply",
};

export const rollbackNoticeText = (notice: Pick<RollbackNotice, "playerName" | "kind">): string =>
  `The story stepped back to ${playerPlaceText(notice.playerName)} ${notice.kind ? ROLLBACK_CAUSE[notice.kind] : "to match the change in the chat"}.`;

export const transitionNoteText = (checkpoint: Pick<Checkpoint, "name" | "objective" | "player_name" | "player_text">): string => {
  const title = (checkpoint.player_name ?? checkpoint.name).trim();
  const text = checkpoint.player_text?.trim();
  return text && text !== title ? `◈ ${title} — ${text}` : `◈ ${title}`;
};

const IDENTIFIER_LIKE = /^[^A-Z\s]+$/;

export const playerLocation = (story: Pick<NormalizedStoryV2, "qualityByKey"> | null, value: string | null): string | null => {
  if (!story || !value) return null;
  return story.qualityByKey.location?.player_labels?.[value] ?? (IDENTIFIER_LIKE.test(value) ? null : value);
};

export const steppedBackText = (playerName: string | null | undefined): string => `Stepped back to ${playerPlaceText(playerName)}`;

// Other half: an edit the run cannot rewind to. Not a variant of the notice above — that one
// says the story moved, and the whole point here is that it did not. Player wording, checkpoint
// names only, and it names the two ways out rather than leaving the player with a stuck story.
export interface RollbackUnavailable {
  messageId: number;
  checkpointName: string;
  oldest: { boundary: number; messageId: number };
  at: string;
}

export const rollbackUnavailableText = (notice: RollbackUnavailable): string =>
  `That edit reaches back further than this chat can rewind, so the story has not moved: you are still at ${notice.checkpointName}. What was learned from the changed messages ` +
    `has been dropped. Re-read from ${notice.checkpointName} to rebuild it, or restart the story to play the new text from the beginning.`;

// A branch holds the story state it was cut from, and nothing adopts it on its own.
// Checkpoint names only, one sentence, one way forward.
export const branchNoticeText = (checkpointName: string | null): string =>
  `This chat branched from a story in progress${checkpointName ? `, last at ${checkpointName}` : ""}. Continue from here to pick the story up where this branch ends.`;

export interface NarrativeInput {
  storyTitle: string | null;
  publicIntro?: string | null;
  checkpointName: string | null;
  objective: string | null;
  lastTransition: NarrativeTransition | null;
  latestScene?: LatestScene | null;
  openThreads: string[];
  canon: string;
  tensionLevel: TensionLevel | null;
  pendingCount: number;
  pipeline: PipelineStatus;
  sceneLocation?: string | null;
  /**
   * The scene tracker has stopped answering. Distinct from simply having no
   * location — "we never knew" says nothing, while "we knew and can no longer confirm it" is
   * something the player should be told rather than left to infer from a place name that has
   * quietly gone stale.
   */
  sceneUnconfirmed?: boolean;
  /** The write of this chat's own state was not confirmed, in the player's own words. */
  saveNotice?: string | null;
  /**
   * The player's last two turns matched no exit the checkpoint declares. The
   * honest sentence is that the world has not answered yet — never that the prepared route happened
   * anyway, and never silence.
   */
  agencyNotice?: string | null;
  /**
   * The recap's phrasing follows the same policy as steering —
   * an objective that needs the player's own act must not read as one the world will resolve for them.
   */
  objectiveKind?: ObjectiveKind;
  /** Sealed chapters as "title — short", the current one last; the saga record once the story ended. */
  chapters?: string[];
  epilogue?: string | null;
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

export const excerpt = (value: string, max = CANON_EXCERPT_CHARS): string => {
  if (value.length <= max) return value;
  const head = value.slice(0, max);
  const sentence = head.match(/^[\s\S]*[.!?…]["'”’)]?(?=\s)/)?.[0];
  if (sentence && sentence.length >= max / 3) return sentence.trimEnd();
  const word = head.replace(/\s+\S*$/, "");
  return `${(word || head).trimEnd()}…`;
};

export function buildNarrativeStatus(input: NarrativeInput): NarrativeStatus {
  const sections: NarrativeSection[] = [];

  const now: string[] = [];
  if (input.checkpointName) now.push(input.checkpointName);
  if (input.sceneLocation) now.push(`At ${input.sceneLocation}.`);
  // Never both: a confirmed place wins, and this line only appears when the tracker had one and
  // can no longer stand behind it. Player-facing, so it says what is true without naming the
  // machinery — no "tracker", no "judge", no failure count.
  else if (input.sceneUnconfirmed) now.push("Somewhere the story has not settled yet.");
  if (input.objective && !input.latestScene?.sinceEntry) now.push(input.objective);
  if (input.objective && input.objectiveKind === "player_action") now.push("What happens next is yours to decide.");
  if (input.tensionLevel) now.push(TENSION_COPY[input.tensionLevel]);
  if (now.length) sections.push({ id: "now", label: "Where you are", lines: now });
  if (input.publicIntro?.trim()) sections.push({ id: "about", label: "About this story", lines: [input.publicIntro.trim()] });

  const moved = input.lastTransition;
  const recently = [
    ...(moved ? [moved.fromName ? `You left ${moved.fromName} behind and moved into ${moved.toName}.` : `You moved into ${moved.toName}.`] : []),
    ...(input.latestScene ? [input.latestScene.text] : []),
  ];
  if (recently.length) sections.push({ id: "recently", label: "Recently", lines: recently });

  if (input.openThreads.length) {
    sections.push({ id: "threads", label: "Open threads", lines: input.openThreads });
  }

  if (input.epilogue) sections.push({ id: "end", label: "The End", lines: [input.epilogue] });
  if (input.chapters?.length) sections.push({ id: "chapters", label: "Your story", lines: input.chapters });
  const canon = input.canon.trim();
  if (canon) sections.push({ id: "story", label: input.chapters?.length ? "This chapter" : "The story so far", lines: [excerpt(canon)] });

  if (input.pendingCount > 0) {
    const noun = input.pendingCount === 1 ? "thing" : "things";
    sections.push({ id: "pending", label: "Noted", lines: [`${input.pendingCount} ${noun} the story picked up — they take effect on the next turn.`] });
  }

  // The player's own state may not have reached the server. It goes in the SAME status
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

export const PLAYER_COPY = {
  currentScene: "Current scene",
  openDrawer: "Open the story",
  requirementsHeading: "This story still needs",
  rereadButton: "Re-read from the current scene",
  restartButton: "Restart story",
  openSettingsButton: "Open story settings",
  retryButton: "Try again",
  branchContinue: "Continue from here",
  chaptersHeading: "Your story",
  chapterFlagTitle: "Something is wrong in this summary: flag it for the author",
  flaggedToast: "Moment flagged for the author.",
  memorizeError: "Memorizing the chat stopped before the end. Try again later.",
  imageError: "The last image could not be made. Try again in a moment.",
  imagePreferenceError: "Could not save the image preference.",
  imageManualOff: "Automatic images are off.",
  imageModelChooses: "The model may request an image.",
  imageInstallOff: "Automatic images are off for this install.",
  imageNoJobs: "No images waiting",
  announceTransitions: "Also post a chat note when the story moves on",
  spriteUnavailable: "This SillyTavern cannot show character sprites.",
  spriteNoPack: "No one in this chat has a sprite pack.",
  memoryHeading: "What the story remembers",
  keptByYou: "kept by you",
  sourceChanged: "the message it came from changed",
  sceneChanged: "The scene changed",
  storyMovedOn: "The story moved on",
  nothingNoted: "Nothing new noted",
} as const;

export type RequirementKind = "persona" | "cast" | "lore";

const REQUIREMENT_LABELS: Record<RequirementKind, string> = { persona: "Your character", cast: "The cast", lore: "The story's background lore" };

export const requirementNotReadyText = (kind: RequirementKind): string => `${REQUIREMENT_LABELS[kind]} is not ready in this chat.`;

export const chapterNowText = (title: string): string => `Now: ${title}`;

export const chapterFlagLabel = (title: string): string => `Flag the summary of ${title}`;

export const previouslyText = (title: string, summary: string): string => `Previously — ${title}\n\n${summary}`;

export const chapterAnnouncementText = (number: number | string, title: string): string => `◆ Chapter ${number} — ${title}`;

export const awayRecapTitle = (storyTitle: string, gap: string): string => `Welcome back — ${storyTitle} (away ${gap})`;

export const pinnedOverflowText = (count: number): string =>
  `${count} pinned ${count === 1 ? "memory" : "memories"} did not fit — unpin some to make room.`;

export const memorizeProgressText = (processed: number, total: number): string => `Memorizing: ${processed}/${total}`;

export const imageAutomationText = (mode: "story" | "manual" | "everyN" | string, cues: string[], everyN: number): string => {
  if (mode === "story") return `This story requests art at ${cues.join(" and ") || "no moments yet"}.`;
  if (mode === "manual") return PLAYER_COPY.imageManualOff;
  if (mode === "everyN") return `An image is requested every ${everyN} replies${cues.length ? ` and at ${cues.join(" and ")}` : ""}.`;
  return PLAYER_COPY.imageModelChooses;
};

export const spriteOnStageText = (names: string[]): string => (names.length ? `On stage: ${names.join(", ")}` : PLAYER_COPY.spriteNoPack);

export const inlineTransitionText = (playerName: string | null, objective: string | null): string =>
  (playerName ? (objective ? `${playerName}: ${objective}` : playerName) : PLAYER_COPY.storyMovedOn);

export const rememberedText = (text: string): string => `Remembered: ${text}`;

export const threadOpenedText = (text: string): string => `New thread: ${text}`;

export const threadResolvedText = (text: string): string => `Thread resolved: ${text}`;

export const loreConsultedText = (named: string[], total: number): string => {
  if (!named.length) return `Lore consulted: ${total} ${total === 1 ? "entry" : "entries"}`;
  const rest = total - named.length;
  return `Lore consulted: ${named.join(", ")}${rest ? ` and ${rest} more` : ""}`;
};

export const MEMORY_TIER_LABELS: Record<MemoryTier, string> = {
  facts: "Facts",
  session_details: "Session details",
  short_term: "Short-term",
  scene_history: "Scene history",
};

export const CP_AUTHOR_ONLY_TEXT = "/cp is an author tool and shows the story's internals. Turn on Author view in the story drawer to use it; /story recap shows where the story is.";

export const SO_MEM_AUTHOR_ONLY_TEXT = "/so-mem backlog is an author tool. Turn on Author view in the story drawer to use it.";

export const castChangeText = (name: string, left: boolean): string => `${name} ${left ? "left" : "joined"}`;

export const chosenToSpeakText = (name: string): string => `${name} was chosen to speak`;

export const tensionLevelText = (level: string): string => `Tension: ${level}`;

export const readNotedText = (count: number, pending: boolean): string => {
  if (!count) return PLAYER_COPY.nothingNoted;
  const things = `${count} thing${count === 1 ? "" : "s"}`;
  return pending ? `${things} noted, apply next turn` : `${things} noted`;
};

export const DERIVED_PLAYER_COPY: Record<string, string> = {
  scene_summary: "Scene summarized",
  short_term: "Recent events condensed",
  dedup: "Older memories folded",
  arc_summary: "A thread was summarized",
  canon: "The story so far was updated",
};
