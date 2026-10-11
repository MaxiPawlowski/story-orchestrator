import type { CardBinding, MemberSprites, StoryPoses, StoryV2, ValidationError } from "@engine/schema";
import { readMemberSprites, readStoryPoses } from "@engine/validate/poses";
import { validateCardLayers } from "@engine/validate/cardLayers";
import { isRecord } from "@utils/guards";
import { setMemberPoses, setPoses, setPoseCard } from "../../studio/poseMutations";
import type { OpDescription } from "../index";

export type PoseAgentOp = { kind: "setPoses"; poses: StoryPoses } | { kind: "setMemberPoses"; id: string; sprites: MemberSprites } | { kind: "setPoseCard"; id: string; card: CardBinding };
export const POSE_AGENT_KINDS: ReadonlySet<string> = new Set(["setPoses", "setMemberPoses", "setPoseCard"]);
export function readPoseCall(tool: string, args: Record<string, unknown>): { ok: true; op: PoseAgentOp } | { ok: false; message: string } {
  const errors: ValidationError[] = [];
  const id = String(args.id ?? "").trim();
  const poses = tool === "setPoses" ? readStoryPoses(args.poses, errors) : undefined;
  const sprites = tool === "setMemberPoses" ? readMemberSprites(args.sprites, "sprites", errors) : undefined;
  if (tool === "setPoseCard") {
    if (!isRecord(args.card) || !isRecord(args.card.fields)) errors.push({ path: "card", message: "card needs fields" });
    else {
      for (const [field, binding] of Object.entries(args.card.fields)) if (!isRecord(binding) || typeof binding.quality !== "string") {
        errors.push({ path: `card.fields.${field}`, message: "field needs a quality" });
      }
      validateCardLayers([{ id, card: { fields: args.card.fields as CardBinding["fields"] } }], undefined, errors);
    }
  }
  if (errors.length) return { ok: false, message: errors.map((error) => `${tool}.${error.path}: ${error.message}`).join("; ") };
  if (tool === "setPoses") return { ok: true, op: { kind: "setPoses", poses: poses ?? {} } };
  if (tool === "setMemberPoses") return { ok: true, op: { kind: "setMemberPoses", id, sprites: sprites ?? {} } };
  return { ok: true, op: { kind: "setPoseCard", id, card: args.card as CardBinding } };
}
export const applyPoseOp = (draft: StoryV2, op: PoseAgentOp): StoryV2 => op.kind === "setPoses" ? setPoses(draft, op.poses)
  : op.kind === "setMemberPoses" ? setMemberPoses(draft, op.id, op.sprites) : setPoseCard(draft, op.id, op.card);
export const describePoseOp = (op: PoseAgentOp): OpDescription => ({ action: "update", entity: op.kind === "setPoses" ? "story.poses" : `roster.${op.id}`,
  label: op.kind === "setPoses" ? "Set the story pose library" : `${op.kind === "setMemberPoses" ? "Poses" : "Character layers"} for ${op.id}` });
export const poseOpProblem = (draft: StoryV2, op: PoseAgentOp): string | null => op.kind === "setPoses" || draft.roster.some((member) => member.id === op.id) ? null : `'${op.id}' is not a roster id`;
