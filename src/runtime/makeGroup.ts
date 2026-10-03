import { castCardName, type StoryV2 } from "@engine/index";
import { draftCastNames, validateProvisioningOp } from "@wizard/provisioning";
import type { ProvisioningEnvironment } from "@wizard/types";
import { log } from "@utils/log";

export type MakeGroupStory = Pick<StoryV2, "title" | "roster" | "requirements">;

export interface MakeGroupInput {
  story: MakeGroupStory;
  environment: Pick<ProvisioningEnvironment, "characterNames" | "groupNames">;
  character: string | null;
}

export type MakeGroupPlan =
  | { ok: true; name: string; members: string[]; question: string }
  | { ok: false; missing: string[]; narrator: string | null; message: string };

const norm = (value: string) => value.trim().toLowerCase();
const has = (values: readonly string[], wanted: string) => values.some((value) => norm(value) === norm(wanted));

export const narratorOf = (story: MakeGroupStory): string | null => {
  const member = (story.roster ?? []).find((entry) => entry.view === "omniscient" || /narrat/i.test(entry.role ?? "") || /narrat/i.test(entry.id));
  return member ? castCardName(member) : null;
};

export const freeGroupName = (title: string, taken: readonly string[]): string => {
  const base = title.trim() || "Story";
  if (!has(taken, base)) return base;
  let index = 2;
  while (has(taken, `${base} (${index})`)) index += 1;
  return `${base} (${index})`;
};

const listed = (names: string[]) => names.map((name) => `"${name}"`).join(", ");

export function planMakeGroup(input: MakeGroupInput): MakeGroupPlan {
  const cast = draftCastNames(input.story);
  const members = cast.length ? cast : input.character ? [input.character] : [];
  const narrator = narratorOf(input.story);
  if (!members.length) return { ok: false, missing: [], narrator, message: "This story names no cast, so there is no one to put in its group. Add the cast in the Studio first." };
  const missing = members.filter((member) => !has(input.environment.characterNames, member));
  if (missing.length) {
    const narratorMissing = narrator !== null && has(missing, narrator);
    const others = missing.filter((member) => !narratorMissing || norm(member) !== norm(narrator ?? ""));
    const message = [
      narratorMissing ? `The story's narrator card ${listed([narrator as string])} is not on this install, and the story is told through it.` : "",
      others.length ? `${others.length === 1 ? "This card is" : "These cards are"} not on this install: ${listed(others)}.` : "",
      "A group without them would be a partial cast, so no group was made. Fix with wizard creates the missing cards.",
    ].filter(Boolean).join(" ");
    return { ok: false, missing, narrator: narratorMissing ? narrator : null, message };
  }
  const name = freeGroupName(input.story.title, input.environment.groupNames);
  const validation = validateProvisioningOp({ kind: "createGroup", name, members }, {
    characterNames: input.environment.characterNames, groupNames: input.environment.groupNames, castNames: members,
    lorebookNames: [], storyLorebooks: [], ownedLorebooks: [], grantedLorebooks: [], personaNames: [],
  });
  if (!validation.ok) return { ok: false, missing: [], narrator, message: validation.message };
  return {
    ok: true, name, members,
    question: `Make a group "${name}" with ${listed(members)} for "${input.story.title}"? It is created new (nothing you have is changed), set to start this story, and opened.`,
  };
}

export interface MakeGroupDeps {
  story: (storyId: string) => MakeGroupStory | null;
  environment: () => MakeGroupInput["environment"];
  character: () => string | null;
  confirm: (question: string) => Promise<boolean>;
  beginRun: () => { stillOwns: () => boolean };
  createGroup: (name: string, members: string[]) => Promise<{ id: string; name: string }>;
  bind: (groupId: string, storyId: string) => void;
  open: (groupId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  select: (storyId: string) => Promise<boolean>;
}

export type MakeGroupOutcome =
  | { ok: true; group: string; message: string }
  | { ok: false; reason: "unknown-story" | "missing" | "refused" | "cancelled" | "lapsed" | "failed"; message: string; missing?: string[]; narrator?: string | null };

export async function makeGroupForStory(deps: MakeGroupDeps, storyId: string): Promise<MakeGroupOutcome> {
  const story = deps.story(storyId);
  if (!story) return { ok: false, reason: "unknown-story", message: `The story "${storyId}" is not in the library any more, so there is no cast to make a group from.` };
  const plan = planMakeGroup({ story, environment: deps.environment(), character: deps.character() });
  if (!plan.ok) return { ok: false, reason: plan.missing.length ? "missing" : "refused", message: plan.message, missing: plan.missing, narrator: plan.narrator };
  const run = deps.beginRun();
  if (!(await deps.confirm(plan.question))) return { ok: false, reason: "cancelled", message: "No group was made." };
  if (!run.stillOwns()) return { ok: false, reason: "lapsed", message: "The chat changed before the group was made, so nothing was created." };
  let group: { id: string; name: string };
  try {
    group = await deps.createGroup(plan.name, plan.members);
  } catch (error) {
    log.warn("making a group for a story failed", error);
    return { ok: false, reason: "failed", message: `The group "${plan.name}" could not be created. Try again, or reload SillyTavern.` };
  }
  deps.bind(group.id, storyId);
  const made = `Made the group "${group.name}" and set it to start "${story.title}"`;
  if (!run.stillOwns()) return { ok: false, reason: "lapsed", message: `${made}. The chat changed meanwhile, so it was not opened: open it from the character list.` };
  const opened = await deps.open(group.id);
  if (!opened.ok) {
    log.warn("the new group could not be opened", opened.reason);
    return { ok: false, reason: "failed", message: `${made}, but it could not be opened. Open it from the character list.` };
  }
  await deps.select(storyId);
  return { ok: true, group: group.name, message: `Made the group "${group.name}" for "${story.title}" and opened it.` };
}
