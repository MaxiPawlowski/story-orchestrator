import type { Band, Ellipse, Point, Strand } from "../types";

export type ArmState = "free" | "resting" | "holding";
export type BodyPose = "standing" | "sitting" | "other";

export interface BodyArm {
  side: "left" | "right";
  state: ArmState;
  shoulder: Point;
  elbow: Point;
  wrist: Point;
  outline: Point[];
  swing: number;
  bend: number;
}

export interface BodyRig {
  version: 1;
  kind: "body";
  pose: BodyPose;
  image: { width: number; height: number };
  head: Ellipse & { pivotX: number; pivotY: number; maxRoll: number; band: Band; side: Band };
  torso: {
    pivotX: number;
    pivotY: number;
    maxRoll: number;
    sway: number;
    breath: number;
    waistBand: Band;
    breathBand: Band;
    chest: Ellipse;
  };
  arms?: BodyArm[];
  strands?: Strand[];
  eyes?: Ellipse[];
  mesh: { baseCell: number; armCell: number };
}

export interface BodyLayer { name: string; rect: [number, number, number, number]; image: string }

export interface BodyManifest {
  version: 1;
  kind: "body";
  member: string;
  look: string;
  pose: string;
  artHash: string;
  source: string;
  rig: BodyRig;
  layers: BodyLayer[];
}
