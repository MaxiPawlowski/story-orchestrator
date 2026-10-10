import type { PoseEntry } from "@engine/poseSchema";
import { choosePose, keywordPose } from "./library";

export interface PoseRead { pose?: string; poseKeyword?: string; poseScope?: string }
export function replayPose(poses: readonly PoseEntry[], rows: readonly PoseRead[], scope: string, directed?: string, defaultPose?: string): PoseEntry | null {
  const applicable = rows.filter((row) => row.poseScope === scope);
  const keyword = [...applicable].reverse().find((row) => row.poseKeyword && poses.some((pose) => pose.id === row.poseKeyword))?.poseKeyword;
  const picked = [...applicable].reverse().find((row) => row.pose && poses.some((pose) => pose.id === row.pose))?.pose;
  return choosePose({ poses, directed, keyword, picked, default: defaultPose });
}

export function poseRead(poses: readonly PoseEntry[], text: string, picked: string | null, scope: string): PoseRead {
  const keyword = keywordPose(poses, text);
  return { ...(picked ? { pose: picked } : {}), ...(keyword ? { poseKeyword: keyword } : {}), poseScope: scope };
}
