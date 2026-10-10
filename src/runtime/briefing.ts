import { composeBriefing, type BriefingSection, type BriefingView, type NormalizedStoryV2 } from "@engine/index";
import { isRecord } from "@utils/guards";

export interface BriefingDraft {
  storyId: string;
  hash: string;
  sections: BriefingSection[];
  at: string;
}

export interface BriefingRecord {
  seen: boolean;
  draft?: BriefingDraft;
}

export const freshBriefing = (): BriefingRecord => ({ seen: false });

const isText = (value: unknown): value is string => typeof value === "string";

const sanitizeDraft = (value: unknown): BriefingDraft | undefined => {
  if (!isRecord(value) || !Array.isArray(value.sections) || !isText(value.storyId) || !isText(value.hash)) return undefined;
  const sections = value.sections.filter((entry): entry is BriefingSection => isRecord(entry) && isText(entry.heading) && isText(entry.text));
  return sections.length ? { storyId: value.storyId, hash: value.hash, sections, at: String(value.at) } : undefined;
};

export const sanitizeBriefingRecord = (value: unknown): BriefingRecord | undefined => {
  if (!isRecord(value) || typeof value.seen !== "boolean") return undefined;
  const draft = sanitizeDraft(value.draft);
  return draft ? { seen: value.seen, draft } : { seen: value.seen };
};

export const draftFor = (record: BriefingRecord | undefined, storyId: string | null, hash: string | null | undefined): BriefingSection[] | null => {
  const draft = record?.draft;
  return draft && draft.storyId === storyId && draft.hash === hash ? draft.sections : null;
};

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
  hash?: string | null;
}

export const briefingState = ({ story, storyId, record, enabled, chatOpen, hash }: BriefingSources): BriefingState | null => {
  if (!story || !storyId) return null;
  return { storyId, view: composeBriefing(story, draftFor(record, storyId, hash)), pending: chatOpen && record?.seen === false, enabled };
};

export const activationOpen = (boundary: number | null | undefined): boolean => !boundary;

export const briefingDue = (state: BriefingState | null | undefined, blocks: number): boolean =>
  Boolean(state?.pending) && activationPanes({ blocks, briefing: Boolean(state?.enabled && state.view) }).length > 0;
