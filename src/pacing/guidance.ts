import type { AgencyPolicy, Checkpoint } from "@engine/index";

export const GUIDANCE_HEADER = "Scene direction:";

export const composeGuidanceBlock = (checkpoint: Checkpoint | null | undefined, _policy: AgencyPolicy): string => {
  const guidance = checkpoint?.guidance?.trim() ?? "";
  return guidance ? `${GUIDANCE_HEADER} ${guidance}` : "";
};
