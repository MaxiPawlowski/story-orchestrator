import { PLAYER_ATTEMPTS_CLAUSE, objectiveLine, type AgencyPolicy, type Checkpoint } from "@engine/index";

export const GUIDANCE_HEADER = "Scene direction:";

export const composeGuidanceBlock = (checkpoint: Checkpoint | null | undefined, policy: AgencyPolicy, withObjective = false): string => {
  const guidance = checkpoint?.guidance?.trim() ?? "";
  return [
    guidance ? `${GUIDANCE_HEADER} ${guidance}` : "",
    withObjective && checkpoint?.objective?.trim() ? objectiveLine(checkpoint, policy) : "",
    policy.player_attempts_only ? PLAYER_ATTEMPTS_CLAUSE : "",
  ].filter(Boolean).join("\n");
};
