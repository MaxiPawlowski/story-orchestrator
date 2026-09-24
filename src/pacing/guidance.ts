import { PLAYER_ATTEMPTS_CLAUSE, type AgencyPolicy, type Checkpoint } from "@engine/index";

export const GUIDANCE_HEADER = "Scene direction:";

export const composeGuidanceBlock = (checkpoint: Checkpoint | null | undefined, policy: AgencyPolicy): string => {
  const guidance = checkpoint?.guidance?.trim() ?? "";
  return [guidance ? `${GUIDANCE_HEADER} ${guidance}` : "", policy.player_attempts_only ? PLAYER_ATTEMPTS_CLAUSE : ""].filter(Boolean).join("\n");
};
