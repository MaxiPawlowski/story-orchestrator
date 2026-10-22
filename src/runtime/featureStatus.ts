import type { StoryFeatureId } from "@engine/featurePolicy";
import { FEATURE_CONTROLS } from "./featureControls";
import { AUTOMATIC_STAGE, type FeatureSource, type ResolvedFeature } from "./featureResolve";
import type { RuntimeSnapshot } from "./types";

export const FEATURE_WORDS = {
  installOff: "Off on this install",
  storyOff: "Turned off by this story",
  chatOff: "Off in this chat",
  deviceOff: "Off on this device",
  enabled: "Enabled",
  ready: "Ready",
  openStory: "Open a story to use this feature",
  missingModel: "Missing setup: choose a model",
  noScope: "Not used by this story: no curator scope",
  waitingBranches: "Waiting for adaptive branches",
  working: "Working",
  fallback: "Fallback: model route unavailable",
} as const;

export const waitingWord = (count: number): string => `Waiting for review: ${count} changes`;

export type FeatureSetup = "ready" | "missing" | "fallback" | "waiting" | "no-story";

export interface FeatureStatusView {
  word: string;
  short: string;
  source: FeatureSource;
  setup: FeatureSetup;
}

export type FeatureStatusSnapshot = Pick<RuntimeSnapshot, "ready" | "roleRoutes" | "extraction" | "stagecraftScope" | "features" | "stagecraft">;

export const offWord = (source: FeatureSource): string => (source === "install" ? FEATURE_WORDS.installOff : source === "story" ? FEATURE_WORDS.storyOff
  : source === "device" ? FEATURE_WORDS.deviceOff : FEATURE_WORDS.chatOff);

export const featureStateWord = (feature: ResolvedFeature | undefined): string => {
  if (!feature) return FEATURE_WORDS.chatOff;
  if (feature.masterOff) return FEATURE_WORDS.installOff;
  if (!feature.enabled) return feature.declined ? FEATURE_WORDS.storyOff : FEATURE_WORDS.chatOff;
  return feature.automatic ? AUTOMATIC_STAGE : FEATURE_WORDS.enabled;
};

const MISSING_ROUTE = ["missing", "not-configured", "not-logged-in"];
const FALLBACK_ROUTE = ["not-answering", "quota", "failed", "reasoning-exhausted"];

export const waitingCount = (snapshot: Pick<RuntimeSnapshot, "stagecraft">, id: StoryFeatureId): number => (snapshot.stagecraft?.proposals ?? [])
  .filter((proposal) => (id === "curator" ? proposal.curator === "wi" : id === "continuity" ? proposal.curator === "warden" : false))
  .flatMap((proposal) => proposal.ops).filter((op) => op.status === "pending").length;

export const featureStatus = (feature: ResolvedFeature, snapshot: FeatureStatusSnapshot, id: StoryFeatureId, install: boolean, waiting: number): FeatureStatusView => {
  const short = featureStateWord(feature);
  const at = (word: string, setup: FeatureSetup = "ready"): FeatureStatusView => ({ word, short, source: feature.source, setup });
  if (!feature.enabled) return at(short);
  if (!snapshot.ready && !install) return at(FEATURE_WORDS.openStory, "no-story");
  const role = snapshot.roleRoutes?.find((route) => route.role === FEATURE_CONTROLS[id].role);
  if (role && MISSING_ROUTE.includes(role.state)) return at(FEATURE_WORDS.missingModel, "missing");
  if (!role && FEATURE_CONTROLS[id].role && !snapshot.extraction.settings.profileId) return at(FEATURE_WORDS.missingModel, "missing");
  if (id === "curator" && !install && snapshot.stagecraftScope.length === 0) return at(FEATURE_WORDS.noScope, "missing");
  if (id === "prefetch" && snapshot.features && !snapshot.features.branching.enabled) return at(FEATURE_WORDS.waitingBranches, "waiting");
  if (waiting) return at(waitingWord(waiting), "waiting");
  if (id === "reading" && snapshot.extraction.scheduler?.inFlight) return at(FEATURE_WORDS.working);
  if (role && FALLBACK_ROUTE.includes(role.state)) return at(FEATURE_WORDS.fallback, "fallback");
  return at(feature.automatic ? AUTOMATIC_STAGE : FEATURE_WORDS.ready);
};
