import type { StoryFeatureId } from "@engine/featurePolicy";
import type { WorkspaceIntent } from "@runtime/workspaceNavigation";
import type { TourView } from "./request";

export type TourMockId =
  | "settings" | "start" | "brief" | "turn" | "story" | "people" | "stuck" | "flag" | "restart"
  | "authorview" | "graph" | "wizard" | "validate" | "lore" | "layer" | "preview" | "library"
  | "setting" | "policies";

export type TourChipTone = "bad" | "warn" | "good" | "plain";

export interface TourSettingMock {
  page: string;
  label: string;
  kind: "select" | "toggle" | "key" | "button";
  options?: readonly string[];
  before: { text: string; tone: TourChipTone };
  after: { text: string; tone: TourChipTone };
}

export interface TourStep {
  id: string;
  title: string;
  lead: string;
  do: readonly string[];
  see: readonly string[];
  off: readonly string[];
  mock: TourMockId;
  doc?: string;
  docTitle?: string;
  show?: WorkspaceIntent;
  where?: string;
  keywords?: readonly string[];
  level?: number;
  unlocks?: string;
  cost?: string;
  setting?: TourSettingMock;
  features?: readonly StoryFeatureId[];
}

export interface TourGroup {
  title: string;
  steps: readonly TourStep[];
}

export interface TourRoute {
  view: TourView;
  label: string;
  groups: readonly TourGroup[];
}
