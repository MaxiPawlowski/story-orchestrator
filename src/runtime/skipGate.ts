import type { Checkpoint, NormalizedStory, RosterMember } from "@engine/index";

export type SkipBlock = "first-reply" | "generating" | "check-pending" | "checkpoint" | "no-teller" | "busy";

export interface SkipView {
  enabled: boolean;
  reason: string | null;
}

export interface SkipTeller {
  rosterId: string;
  name: string;
}

export interface SkipGateInput {
  committed: boolean;
  generating: boolean;
  outcomePending: boolean;
  allowedHere: boolean;
  teller: SkipTeller | null;
  running: boolean;
}

export const SKIP_COPY = {
  label: "Skip ahead",
  title: "Skip travel, waiting or routine, up to the next part of the day; the narrator stops where you are needed.",
  started: "Skipping ahead.",
  off: "Skip ahead is switched off for this chat.",
  noStory: "No story is playing in this chat.",
  blocked: {
    "first-reply": "Skip ahead opens after the story's first reply.",
    generating: "Wait for the reply to finish, then skip ahead.",
    "check-pending": "A check's outcome is still to be told; play that turn first.",
    checkpoint: "This scene cannot be skipped.",
    "no-teller": "This story has no narrator or scene lead to tell the skip.",
    busy: "Already skipping ahead.",
  } satisfies Record<SkipBlock, string>,
  journal: "Skipped ahead (player)",
  moved: "The chat changed before the skip finished, so nothing was kept.",
} as const;

export const skipBlock = (input: SkipGateInput): SkipBlock | null => {
  if (input.running) return "busy";
  if (!input.committed) return "first-reply";
  if (input.generating) return "generating";
  if (input.outcomePending) return "check-pending";
  if (!input.allowedHere) return "checkpoint";
  if (!input.teller) return "no-teller";
  return null;
};

export const skipViewOf = (block: SkipBlock | null): SkipView => ({ enabled: block === null, reason: block ? SKIP_COPY.blocked[block] : null });

const named = (roster: readonly RosterMember[], ref: string | undefined): RosterMember | undefined => {
  const wanted = ref?.trim().toLowerCase();
  return wanted ? roster.find((member) => [member.id, member.name ?? ""].some((name) => name.trim().toLowerCase() === wanted)) : undefined;
};

export const skipTeller = (story: Pick<NormalizedStory, "roster">, active: Checkpoint | null | undefined, speaks: (name: string) => boolean): SkipTeller | null => {
  const narrator = story.roster.find((member) => member.view === "omniscient" && speaks(member.name ?? member.id));
  const lead = named(story.roster, active?.talk_control?.lead);
  const teller = narrator ?? (lead && speaks(lead.name ?? lead.id) ? lead : undefined);
  return teller ? { rosterId: teller.id, name: teller.name ?? teller.id } : null;
};
