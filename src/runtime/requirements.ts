import type { NormalizedStoryV2 } from "@engine/index";
import { getContext, listGlobalLorebooks, listGroupMembers } from "@services/STAPI";
import type { RequirementsState } from "./types";

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readStrings = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

const hasCaseInsensitive = (values: string[], wanted: string) => values.some((value) => value.trim().toLowerCase() === wanted.trim().toLowerCase());

export function evaluateRequirements(story: NormalizedStoryV2 | null): RequirementsState {
  if (!story || !isRecord(story.requirements)) {
    return { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };
  }

  const requiredPersonas = readStrings(story.requirements.personas ?? story.requirements.persona);
  const requiredMembers = readStrings(story.requirements.members ?? story.requirements.groupMembers ?? story.requirements.group_members);
  const requiredLorebooks = readStrings(story.requirements.lorebooks ?? story.requirements.globalLorebooks ?? story.requirements.global_lorebooks);
  const context = getContext();
  const currentPersona = typeof context.name1 === "string" ? context.name1.trim() : "";
  const members = listGroupMembers();
  const lorebooks = listGlobalLorebooks();

  const missingPersonas = requiredPersonas.filter((persona) => !currentPersona || currentPersona.toLowerCase() !== persona.toLowerCase());
  const missingMembers = requiredMembers.filter((member) => !hasCaseInsensitive(members, member));
  const missingLorebooks = requiredLorebooks.filter((lorebook) => !hasCaseInsensitive(lorebooks, lorebook));

  return {
    ready: missingPersonas.length === 0 && missingMembers.length === 0 && missingLorebooks.length === 0,
    missingPersonas,
    missingMembers,
    missingLorebooks,
  };
}
