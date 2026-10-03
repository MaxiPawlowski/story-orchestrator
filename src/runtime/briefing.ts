import { composeBriefing, type BriefingView, type NormalizedStoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";

export interface BriefingRecord {
  seen: boolean;
}

export const freshBriefing = (): BriefingRecord => ({ seen: false });

export const sanitizeBriefingRecord = (value: unknown): BriefingRecord | undefined =>
  (isRecord(value) && typeof value.seen === "boolean" ? { seen: value.seen } : undefined);

export const ACTIVATION_STEPS = ["chat", "story", "before-you-start", "identity", "briefing", "opener"] as const;
export type ActivationStep = (typeof ACTIVATION_STEPS)[number];
export type ActivationPane = Extract<ActivationStep, "before-you-start" | "identity" | "briefing">;

export interface ActivationInput {
  blocks: number;
  briefing: boolean;
  identity?: boolean;
}

export const activationPanes = ({ blocks, briefing, identity = false }: ActivationInput): ActivationPane[] => ([
  ...(blocks > 0 ? ["before-you-start" as const] : []),
  ...(identity ? ["identity" as const] : []),
  ...(briefing ? ["briefing" as const] : []),
]);

export interface BriefingState {
  storyId: string;
  view: BriefingView | null;
  pending: boolean;
  enabled: boolean;
}

export interface BriefingSources {
  story: NormalizedStoryV2 | null;
  storyId: string | null;
  record: BriefingRecord | undefined;
  enabled: boolean;
  chatOpen: boolean;
}

export const briefingState = ({ story, storyId, record, enabled, chatOpen }: BriefingSources): BriefingState | null => {
  if (!story || !storyId) return null;
  return { storyId, view: composeBriefing(story), pending: chatOpen && record?.seen === false, enabled };
};

export const briefingDue = (state: BriefingState | null | undefined, blocks: number): boolean =>
  Boolean(state?.pending) && activationPanes({ blocks, briefing: Boolean(state?.enabled && state.view) }).length > 0;
