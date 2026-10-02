import type { StoryV2 } from "@engine/index";

type AuthoringCode = "house-rule-compound" | "requirement-member-roster-id" | "motive-member-unknown" | "motive-for-player";

export interface AuthoringRun {
  draft: StoryV2;
  push: (code: AuthoringCode, severity: "warning", path: string, message: string) => void;
}

const DEMAND_OPENER = /^(?:no|never|always|do not|don't|avoid|keep|make sure|ensure|describe|let|use|give|show|write|end|refuse|stay)\b/i;
const DEMAND_WORD = /\b(?:never|always|must|should|do not|don't)\b/i;

const demandCount = (rule: string) => rule
  .split(/;|\s(?:and|y)\s/i)
  .map((clause) => clause.trim())
  .filter((clause) => DEMAND_OPENER.test(clause) || DEMAND_WORD.test(clause)).length;

export const checkMotives = ({ draft, push }: AuthoringRun) => {
  const cast = draft.roster.map((member) => member.id);
  const players = ["player", "user", "{{user}}"].concat(draft.requirements?.personas ?? []).map((name) => name.trim().toLowerCase());
  draft.checkpoints.forEach((checkpoint, index) => Object.keys(checkpoint.motives ?? {}).forEach((id) => {
    if (cast.includes(id)) return;
    const player = players.includes(id.trim().toLowerCase());
    push(player ? "motive-for-player" : "motive-member-unknown", "warning", `checkpoints.${index}.motives.${id}`, player ? `'${id}' is the player` : `no cast member '${id}'`);
  }));
};

export const isCompoundHouseRule = (rule: string): boolean => demandCount(rule) >= 2;

export const checkHouseRules = ({ draft, push }: AuthoringRun) => {
  (draft.house_rules ?? []).forEach((rule, index) => {
    if (isCompoundHouseRule(rule)) push("house-rule-compound", "warning", `house_rules.${index}`, `house rule ${index + 1} asks for two things at once; split it into one rule per demand`);
  });
};

const fold = (text: string) => text.trim().toLowerCase();

export const checkRequirementMembers = ({ draft, push }: AuthoringRun) => {
  (draft.requirements?.members ?? []).forEach((member, index) => {
    if (draft.roster.some((entry) => entry.name && fold(entry.name) === fold(member))) return;
    const byId = draft.roster.find((entry) => fold(entry.id) === fold(member));
    if (!byId?.name || fold(byId.name) === fold(member)) return;
    push(
      "requirement-member-roster-id",
      "warning",
      `requirements.members.${index}`,
      `'${member}' is the cast id of '${byId.name}'; requirements name characters by their card name, so require '${byId.name}'`,
    );
  });
};
