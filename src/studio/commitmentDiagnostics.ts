import type { StoryV2 } from "@engine/index";
import { inactionProblem } from "@engine/validate/factions";

type CommitmentCode = "commitment-broken-on-inaction" | "commitment-what-names-a-side";

export const COMMITMENT_CONSEQUENCES: Record<CommitmentCode, string> = {
  "commitment-broken-on-inaction": "The story cannot load: this promise would break because time passed or nothing happened.",
  "commitment-what-names-a-side": "The same words reach the character (\"You told the player you would ...\") and the player (\"Promised you: ...\"): "
    + "a you, I or me reads wrong on one side.",
};

export interface CommitmentRun {
  draft: StoryV2;
  push: (code: CommitmentCode, severity: "blocking" | "warning", path: string, message: string) => void;
}

const SIDES = /\b(you|your|yours|i|me|my|mine)\b/i;

const startValues = (draft: StoryV2) => Object.fromEntries(draft.qualities.flatMap((quality) => (quality.step_rule?.start !== undefined ? [[quality.key, quality.step_rule.start]] : [])));

export const checkCommitmentDiagnostics = ({ draft, push }: CommitmentRun) => {
  const start = startValues(draft);
  draft.roster.forEach((member, index) => (member.commitments ?? []).forEach((commitment, at) => {
    const path = `roster.${index}.commitments.${at}`;
    const problem = commitment.broken_when ? inactionProblem(commitment.broken_when, start) : null;
    const why = problem?.replace("the move fires", "it breaks");
    if (why) push("commitment-broken-on-inaction", "blocking", `${path}.broken_when`, `promise '${commitment.id}' of '${member.id}' breaks on inaction: ${why}`);
    const side = SIDES.exec(commitment.what ?? "");
    const hint = "write what as a verb phrase both sides can read, such as \"repay the debt from the river\"";
    if (side) push("commitment-what-names-a-side", "warning", `${path}.what`, `'${side[1]}' in promise '${commitment.id}': ${hint}`);
  }));
};
