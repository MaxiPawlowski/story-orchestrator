import type { Story } from "@engine/index";
import { readRosterPolish, deliveryNames } from "@engine/validate/delivery";
import { setMemberPolish } from "../../studio/deliveryMutations";
import { setAppearance, setChapters, setHouseRules, setPlayer, setFeatures } from "../../studio/mutations";
import { setCheckpointMotive, setRosterDrive, setRosterView } from "../../studio/innerVoiceMutations";
import type { OpDescription } from "../index";
import { applyPoseOp, describePoseOp, POSE_AGENT_KINDS, poseOpProblem, type PoseAgentOp } from "./poseOps";
import { applyGameOp, describeGameOp, GAME_AGENT_KINDS, gameOpProblem, type GameAgentOp } from "./gameOps";
import type { AgentOnlyOp, AgentOp } from "./types";

const AGENT_ONLY_KINDS: ReadonlySet<string> = new Set<AgentOnlyOp["kind"]>(
  ["setFeatures", "setHouseRules", "setPlayer", "setChapters", "setRosterDrive", "setRosterView", "setCheckpointMotive", "setAppearance", "setMemberPolish",
    ...GAME_AGENT_KINDS, ...POSE_AGENT_KINDS] as AgentOnlyOp["kind"][],
);

const isPoseOp = (op: AgentOnlyOp): op is PoseAgentOp => POSE_AGENT_KINDS.has(op.kind);

const isGameOp = (op: AgentOnlyOp): op is GameAgentOp => GAME_AGENT_KINDS.has(op.kind);

export const isAgentOnly = (op: AgentOp): op is AgentOnlyOp => AGENT_ONLY_KINDS.has(op.kind);

export const applyAgentOnly = (draft: Story, op: AgentOnlyOp): Story => {
  if (isPoseOp(op)) return applyPoseOp(draft, op);
  if (isGameOp(op)) return applyGameOp(draft, op);
  switch (op.kind) {
    case "setHouseRules": return setHouseRules(draft, op.rules);
    case "setPlayer": return setPlayer(draft, op.player);
    case "setChapters": return setChapters(draft, op.chapters, op.assign);
    case "setRosterDrive": return setRosterDrive(draft, op.id, op.drive);
    case "setRosterView": return setRosterView(draft, op.id, op.view);
    case "setCheckpointMotive": return setCheckpointMotive(draft, op.id, op.member, op.motive);
    case "setAppearance": return setAppearance(draft, op.id, op.appearance);
    case "setFeatures": return setFeatures(draft, op.features);
    case "setMemberPolish": return setMemberPolish(setMemberPolish(draft, op.id, null), op.id, op.polish);
  }
};

export const describeAgentOnly = (op: AgentOnlyOp): OpDescription => {
  if (isPoseOp(op)) return describePoseOp(op);
  if (isGameOp(op)) return describeGameOp(op);
  switch (op.kind) {
    case "setHouseRules": return { action: "update", entity: "story.house_rules", label: op.rules.length ? `Set ${op.rules.length} house rule(s)` : "Clear the house rules" };
    case "setPlayer": return { action: "update", entity: "story.player", label: op.player.role ? `The player plays ${op.player.role}` : "Set who the player is" };
    case "setChapters": {
      const assigned = Object.keys(op.assign).length;
      const label = op.chapters.length ? `Chapters: ${op.chapters.map((chapter) => chapter.title).join(" / ")}${assigned ? ` (${assigned} checkpoint(s) assigned)` : ""}` : "Remove every chapter";
      return { action: "update", entity: "story.chapters", label };
    }
    case "setRosterDrive": return { action: "update", entity: `roster.${op.id}.drive`, label: op.drive ? `Drive for ${op.id}: ${op.drive}` : `Clear ${op.id}'s drive` };
    case "setRosterView": return { action: "update", entity: `roster.${op.id}.view`, label: `${op.id} sees ${op.view === "omniscient" ? "every character's private rows" : "only their own"}` };
    case "setCheckpointMotive": {
      const label = op.motive ? `${op.member} wants at ${op.id}: ${op.motive}` : `Clear ${op.member}'s motive at ${op.id}`;
      return { action: "update", entity: `checkpoints.${op.id}.motives.${op.member}`, label };
    }
    case "setAppearance": return { action: "update", entity: "story.illustrations", label: op.appearance ? `Look of ${op.id}: ${op.appearance}` : `Clear ${op.id}'s look` };
    case "setFeatures": return { action: "update", entity: "story.features", label: "Replace story feature policies" };
    case "setMemberPolish": {
      const label = op.polish ? `Voice and delivery for ${op.id}${op.polish.notes ? `: ${op.polish.notes}` : ""}` : `Clear ${op.id}'s voice and delivery`;
      return { action: "update", entity: `roster.${op.id}.polish`, label };
    }
  }
};

const chaptersProblem = (draft: Story, op: Extract<AgentOnlyOp, { kind: "setChapters" }>): string | null => {
  const chapters = new Set(op.chapters.map((chapter) => chapter.id));
  const problems = Object.entries(op.assign).flatMap(([checkpoint, chapter]) => [
    ...(draft.checkpoints.some((entry) => entry.id === checkpoint) ? [] : [`'${checkpoint}' is not a checkpoint`]),
    ...(chapter && !chapters.has(chapter) ? [`'${chapter}' is not one of the chapters sent`] : []),
  ]);
  return problems.length ? problems.join("; ") : null;
};

const polishProblem = (draft: Story, op: Extract<AgentOnlyOp, { kind: "setMemberPolish" }>): string | null => {
  if (!op.polish) return null;
  const errors: Array<{ path: string; message: string }> = [];
  const member = draft.roster.find((entry) => entry.id === op.id);
  readRosterPolish(op.polish, member, { path: "polish", errors, names: deliveryNames(draft) });
  return errors.length ? errors.map(({ path, message }) => [path, message].join(": ")).join("; ") : null;
};

export const agentOnlyProblem = (draft: Story, op: AgentOnlyOp): string | null => {
  if (isPoseOp(op)) return poseOpProblem(draft, op);
  if (isGameOp(op)) return gameOpProblem(draft, op);
  if (op.kind === "setHouseRules" || op.kind === "setPlayer" || op.kind === "setFeatures") return null;
  if (op.kind === "setChapters") return chaptersProblem(draft, op);
  const member = op.kind === "setCheckpointMotive" ? op.member : op.id;
  if (!draft.roster.some((entry) => entry.id === member)) return `'${member}' is not a roster id`;
  if (op.kind === "setCheckpointMotive" && !draft.checkpoints.some((entry) => entry.id === op.id)) return `'${op.id}' is not a checkpoint`;
  if (op.kind === "setMemberPolish") return polishProblem(draft, op);
  return null;
};
