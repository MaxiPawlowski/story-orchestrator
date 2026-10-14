import type { CapabilityState } from "@services/STAPI";
import type { LiveHeadRef } from "./liveHeadRefs";
import type { Framing } from "./direction";
import type { AnimationFrames } from "./animation";
import type { DrawnSource } from "./liveHead/drawn";
import type { SpriteActivation, SpriteSettings } from "./settings";
import type { Segment } from "./segment";
import type { ExpressionRead } from "./classify";

export interface StageActor {
  name: string;
  avatar: string;
  label: string;
  path: string;
  set: string;
  spotlight: boolean;
  pose?: string;
  framing?: Framing;
  frames?: AnimationFrames;
  liveHead?: LiveHeadRef;
  headFrames?: DrawnSource;
}

export type StagePlacement = "vn" | "strip";

export interface StageView {
  visible: boolean;
  placement: StagePlacement;
  waitsForVn: boolean;
  actors: StageActor[];
  speaking: string | null;
  talker: string | null;
  framing: Framing;
  settings: SpriteSettings;
  activation: SpriteActivation;
  capability: CapabilityState | "checking";
  reducedMotion: boolean;
  headSession: string;
}

export interface Stream {
  chatId: string | null;
  speaker: string;
  segments: Segment[];
  reads: Map<string, ExpressionRead>;
  classifying: Promise<void>;
  streamed: boolean;
  final: boolean;
  visibleText?: string;
}
