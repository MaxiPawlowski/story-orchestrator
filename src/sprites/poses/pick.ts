import type { PoseEntry } from "@engine/poseSchema";
import type { JudgeAnswer, JudgeRequest } from "@judge/types";
import { choice, choiceAnswer } from "@judge/questions";

export interface PosePickInput { text: string; member: string; poses: readonly PoseEntry[] }
export interface PosePick { pose: string | null; source: "judge" | "llm" | "none" }
export interface PosePickDeps { judge: ((request: JudgeRequest) => Promise<Record<string, JudgeAnswer> | null>) | null; llm: ((system: string, user: string,
  grammar: string) => Promise<string>) | null }
export const POSE_PICK_FLOOR = 0.8;

export function posePickRequest(input: PosePickInput): JudgeRequest {
  return { state: { member: input.member, reply: input.text }, questions: { pose: choice("Which body pose does `member` visibly take in `reply`? "
    + "Choose none for speech without a body action, a hypothetical action or someone else's action.",
    { ...Object.fromEntries(input.poses.map((pose) => [pose.id, { what: pose.text, tags: pose.tags }])), none: "No visible body action for this member" }) } };
}

export async function pickPose(input: PosePickInput, deps: PosePickDeps): Promise<PosePick> {
  if (!input.text.trim() || !input.poses.length) return { pose: null, source: "none" };
  const valid = (id: string | undefined) => id === "none" || input.poses.some((pose) => pose.id === id);
  if (deps.judge) try {
    const answers = await deps.judge(posePickRequest(input));
    const id = answers ? choiceAnswer(answers, "pose")?.choice : undefined;
    if (valid(id)) return { pose: id === "none" ? null : id as string, source: "judge" };
  } catch { if (!deps.llm) return { pose: null, source: "none" }; }
  if (deps.llm) try {
    const system = `Select the visible body pose of ${input.member} in the reply. `
      + "Speech alone, hypothetical actions and other people's actions mean none. Answer exactly one id.\n"
      + input.poses.map((pose) => `${pose.id}: ${pose.text}; tags: ${pose.tags.join(", ")}`).join("\n")
      + "\nnone: no visible body action.";
    const grammar = `root ::= ${[...input.poses.map((pose) => pose.id), "none"].map((id) => JSON.stringify(id)).join(" | ")}\n`;
    const id = (await deps.llm(system, input.text, grammar)).trim();
    if (valid(id)) return { pose: id === "none" ? null : id, source: "llm" };
  } catch { return { pose: null, source: "none" }; }
  return { pose: null, source: "none" };
}

export function scorePoseFixture(rows: readonly { id: string; pose: string | null }[], answers: Readonly<Record<string, string | null>>): { correct: number; total: number;
  accuracy: number; complete: boolean; floor: number } {
  const correct = rows.filter((row) => Object.hasOwn(answers, row.id) && row.pose === answers[row.id]).length;
  return { correct, total: rows.length, accuracy: rows.length ? correct / rows.length : 0, complete: rows.length === 40 && rows.every((row) => Object.hasOwn(answers, row.id)),
    floor: POSE_PICK_FLOOR };
}
