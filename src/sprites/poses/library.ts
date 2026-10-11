import type { MemberSprites, PoseEntry, StoryPoses } from "@engine/poseSchema";
import { readPoseList } from "@engine/validate/poses";
import { SHIPPED_POSES } from "./shipped";
import { keywordSet } from "../profile";

export const shippedPoses = (): PoseEntry[] => readPoseList(SHIPPED_POSES, "shipped", []);

export function poseLibrary(story: StoryPoses | undefined, installed: readonly PoseEntry[] = []): PoseEntry[] {
  const entries = new Map(shippedPoses().map((pose) => [pose.id, pose]));
  for (const pose of readPoseList([...installed], "installed", [])) entries.set(pose.id, pose);
  for (const pose of story?.custom ?? []) entries.set(pose.id, pose);
  return [...entries.values()].filter((pose) => !story?.use || story.use.some((id) => id === pose.id || pose.tags.includes(id as PoseEntry["tags"][number])));
}

export function memberPoses(library: readonly PoseEntry[], sprites: MemberSprites | undefined): PoseEntry[] {
  return library.filter((pose) => !sprites?.poses || sprites.poses.includes(pose.id) || pose.id === (sprites.pose ?? "stand_relaxed"));
}

export function keywordPose(poses: readonly PoseEntry[], text: string): string | null {
  return keywordSet(poses.map((pose) => ({ id: pose.id, places: [], checkpoints: [], keywords: pose.when?.keywords ?? [] })), text);
}

export function choosePose(input: { poses: readonly PoseEntry[]; directed?: string; keyword?: string | null; picked?: string | null; default?: string }): PoseEntry | null {
  for (const id of [input.directed, input.keyword, input.picked, input.default ?? "stand_relaxed"]) {
    const entry = input.poses.find((pose) => pose.id === id);
    if (entry) return entry;
  }
  return input.poses[0] ?? null;
}
