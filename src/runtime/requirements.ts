import type { NormalizedStoryV2 } from "@engine/index";
import { getContext, listGlobalLorebooks, listGroupMembers } from "@services/STAPI";
import type { RequirementsState } from "./types";

const hasCaseInsensitive = (values: string[], wanted: string) => values.some((value) => value.trim().toLowerCase() === wanted.trim().toLowerCase());

export function evaluateRequirements(story: NormalizedStoryV2 | null): RequirementsState {
  const requirements = story?.requirements;
  if (!requirements) {
    return { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] };
  }

  const context = getContext();
  const currentPersona = typeof context.name1 === "string" ? context.name1.trim() : "";
  const members = listGroupMembers();
  const lorebooks = listGlobalLorebooks();

  const missingPersonas = (requirements.personas ?? []).filter((persona) => !currentPersona || currentPersona.toLowerCase() !== persona.toLowerCase());
  const missingMembers = (requirements.members ?? []).filter((member) => !hasCaseInsensitive(members, member));
  const missingLorebooks = (requirements.lorebooks ?? []).filter((lorebook) => !hasCaseInsensitive(lorebooks, lorebook));

  return {
    ready: missingPersonas.length === 0 && missingMembers.length === 0 && missingLorebooks.length === 0,
    missingPersonas,
    missingMembers,
    missingLorebooks,
  };
}
