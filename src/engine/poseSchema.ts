export type PoseTag = "standing" | "sitting" | "kneeling" | "moving" | "fighting" | "casting" | "gesture" | "lying";
export type PosePoint = [number, number] | null;
export interface PoseEntry {
  id: string;
  label: string;
  tags: PoseTag[];
  framing: "full" | "thigh" | "close";
  props: string[];
  text: string;
  keypoints: { format: "openpose-body18"; canvas: [number, number]; points: PosePoint[] };
  version: number;
  when?: { keywords: string[] };
}
export interface StoryPoses { use?: string[]; custom?: PoseEntry[] }
export interface MemberSprites { pose?: string; poses?: string[] }
export interface StageMember { pose?: string; set?: string; face?: string; hidden?: boolean; framing?: "full" | "thigh" | "close" }
export interface StoryStage { framing?: "full" | "thigh" | "close"; spotlight?: string; cast?: Record<string, StageMember>; [member: string]: StageMember | Record<string,
  StageMember> | string | undefined }
export type CardLayer = "base" | "face" | "decal";
export interface CardFieldBinding {
  quality: string;
  visual?: boolean;
  layer?: CardLayer;
  rebase?: boolean;
  region?: { x: number; y: number; width: number; height: number };
}

export interface CardBinding { fields: Record<string, CardFieldBinding> }
