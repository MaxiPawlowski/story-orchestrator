import { Blackboard } from "@engine/blackboard";
import { cardValues } from "@engine/cardFields";
import type { PoseEntry } from "@engine/poseSchema";
import type { NormalizedStory } from "@engine/schema";
import { isRecord } from "@utils/guards";
import { directionKeys, memberDirection, readStageDirection } from "../direction";
import { memberPoses, poseLibrary } from "./library";
import { replayPose } from "./stageChoice";
import { lookLayers, type LookLayers } from "./layers";

export interface PoseJob { member: string; name: string; pose: PoseEntry; layers: LookLayers; fields: Record<string, string> }

export function posesToPrepare(story: NormalizedStory, installed: readonly PoseEntry[]): PoseJob[] {
  const values = new Blackboard(story).snapshot().values, library = poseLibrary(story.poses, installed);
  const directions = Object.values(story.checkpointById).map((checkpoint) => isRecord(checkpoint.effects) ? readStageDirection(checkpoint.effects.stage) : null);
  const jobs = new Map<string, PoseJob>();
  for (const member of story.roster) {
    const name = member.name ?? member.id, keys = directionKeys(name, [member.id]), allowed = memberPoses(library, member.sprites);
    const fields = cardValues(story, values, member.id, true), layers = lookLayers(member.card, fields);
    const wanted = [{}, ...directions.map((direction) => memberDirection(direction, keys))];
    for (const direction of wanted) {
      if (direction.set || direction.hidden) continue;
      const pose = replayPose(allowed, [], "", direction.pose, member.sprites?.pose);
      if (!pose || (pose.id === "stand_relaxed" && !Object.keys(fields).length)) continue;
      jobs.set(`${member.id}\u0000${pose.id}`, { member: member.id, name, pose, layers, fields });
    }
  }
  return [...jobs.values()];
}
